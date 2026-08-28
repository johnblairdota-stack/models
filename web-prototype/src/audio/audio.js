/**
 * AUDIO — the game had none, until `audio-1` gave it three synthesised voices (gunshot, wall
 * stage crossing, hunter proximity) and the whole set sat unheard for four days. John's first
 * listen (2026-08-08, `docs/slices/task-audio.md`): **"there are a few sounds. they are pretty
 * meh."** That is a QUALITY verdict, not a wiring one — this file's job now is to raise the
 * three that exist and build the one the campaign has never had at all:
 *
 *   0. the melee impact       — `playMeleeImpact(depth01)`, THE headline. `sledge-1` calls it
 *                                on the contact frame; this module owns only the sound, not
 *                                the call site. Timbre tracks depth CONTINUOUSLY: a brittle
 *                                surface crack at ~0, a full-bodied crunch at ~0.3, a drier
 *                                tighter one at ~0.7, and — the single most important sound in
 *                                the game — a FORCE FIELD at 1.0, the cyan
 *                                barrier. John has ruled out a numeric destruction meter, so
 *                                this sound alone has to say "NOT HERE, move along" without a
 *                                word of UI (`docs/design/dig.md` §5).
 *   1. the gun firing          — WeaponSystem.fire(), gated on weapon === 'nailgun'
 *   2. a wall crossing a stage — DestructibleWall.onBreak, the same FX hook debris/dust use
 *   3. hunter proximity        — the exact value hud.setThreat() receives, so ear and eye agree
 *   4. 🚪 the door bang        — `playDoorBang(escalation01)`, NEW. The hunter working on a
 *                                chained door: `HunterAI._bang` fires one per blow and the
 *                                escalation is read off the door's OWN remaining health, so the
 *                                sound of it changing material IS how close it is to being
 *                                through. `views/game.js` owns the distance term. The melee
 *                                voices are untouched — John has approved those.
 *
 * ZERO ASSETS. Everything below is synthesised: one shared noise buffer (white noise,
 * generated once) plus oscillators, filters and gain envelopes. No file, no dependency.
 *
 * VARIATION, AND WHY IT IS DETERMINISTIC. John's dig band is ~60 s of continuous hammering,
 * roughly a blow a second — about 90 hits. A `playMeleeImpact` that is great once and
 * identical the other 89 times has failed (`task-audio.md` §3.3/§4). Every hit draws jitter
 * (pitch, gain, a small pool of timbral variants) from `seedRand(seed, salt)` below — a
 * STATELESS (seed, salt) -> [0,1) hash copied from `game/run.js`'s own `seedRand` ON PURPOSE,
 * same reasoning as that file's own note: this module should not import a gameplay file just
 * to borrow eight lines of arithmetic. Same seed + the same call count reproduces the same
 * jitter sequence, which is what makes a captured 90-hit run reproducible rather than a fresh
 * dice roll on every re-render. `seedAudioVariation(seed)` pins it — see the exported hooks.
 *
 * POOLING. `AudioBufferSourceNode` and `OscillatorNode` are single-use by spec — the Web
 * Audio API does not allow restarting one, so a fresh node per triggered sound is not an
 * oversight, it is the only legal way to retrigger a one-shot in this API. What CAN be
 * pooled, and is: the noise sample data itself (built once in `initAudio`, replayed by every
 * gunshot, wall stage and melee layer rather than regenerated), and every `GainNode`/
 * `BiquadFilterNode` "voice" — one persistent filter+gain chain per gun/melee/barrier-field
 * layer and one per wall stage, built once at init and reused for the life of the session. The
 * hunter cue is the strongest case: two near-unison oscillators plus a shimmer partial,
 * started once in `initAudio` and NEVER recreated — only gain and frequency are automated,
 * every frame, which is the cheapest thing the Web Audio API can do.
 *
 * CAPTURE MODE. `initAudio` is only ever called from the live click-to-start gate in
 * `views/game.js` (`armPlayOverlay`), which itself only runs `if (!engine.capture)` — so in
 * capture mode `initAudio` is simply never called, `ctx` stays null, and every exported
 * function below is a no-op guarded on that. No separate capture check was needed at each
 * call site; the single upstream gate already is one. Verified empty in capture by
 * `harness/scenarios/_audio1-wiring.mjs`.
 *
 * AUTOPLAY / PROMISE SAFETY. `AudioContext.resume()` returns a promise exactly like
 * `requestPointerLock()` does, and `main.js`'s `unhandledrejection` handler turns ANY
 * unhandled rejection into the full-screen "VIEW FAILED" error — the same bug `armPlayOverlay`
 * already had to fix once for pointer lock. The `.resume()` call below is caught the same way.
 */

let ctx = null;
let master = null;
let analyser = null;          // tapped off master; lets a headless check measure REAL samples
let noiseBuffer = null;       // one shared white-noise buffer, replayed (not regenerated) by every voice

// ---- persistent "gun" voice — one filter+gain chain, reused for every shot ----
let gunFilter = null, gunGain = null, gunThumpGain = null;
let gunBodyFilter = null, gunBodyGain = null;   // NEW: low-passed "chest thump" body layer

// ---- persistent per-stage wall voices — five filter+gain chains, one per STAGE_NAMES entry ----
const STAGE_VOICES = [];

// ---- persistent hunter-proximity drone — started once in initAudio, never recreated ----
let huntCarrier = null, huntCarrierGain = null, huntLFO = null, huntLFODepth = null;
let huntCarrier2 = null, huntCarrier2Gain = null;   // NEW: detuned partner -> beating, not a flat tone
let huntShimmer = null, huntShimmerGain = null;     // NEW: thin high partial, fades in only as threat climbs

// ---- persistent melee-impact voice — the headline. One noise/thump/debris chain for the
// "wood" ladder (brittle -> full crunch -> dry) and two separate FIELD chains for the barrier,
// crossfaded by depth. See `playMeleeImpact` for the blend.
let meleeImpactFilter = null, meleeImpactGain = null;   // the primary morphing crack/crunch noise
let meleeThumpGain = null;                              // wood body weight
let meleeDebrisFilter = null, meleeDebrisGain = null;   // settling grit tail (lowpass, GRANULAR — see playMeleeImpact)
let meleeLathFilter = null, meleeLathGain = null;       // splintering lath — a pitched wood snap, deep hits only
let meleeCavityGain = null;                             // the hole itself resonating, grows with depth
// ---- 🚪 persistent DOOR-BANG voice — the hunter working on a chained door. Five layers, each
// one a persistent filter+gain chain like every other voice here: SLAM (the mass of it hitting
// timber), CHAIN (the identity — this is a CHAINED door, and the rattle is the only layer that
// says so), TIMBER (the split, silent until the door is genuinely giving), FRAME (the jamb
// resonating, what makes it a door in a wall rather than a hit in space) and GROAN (the hinge
// under load, the last thing before it comes off). See `playDoorBang`.
let doorSlamGain = null;                                  // low sine, the mass
let doorBodyFilter = null, doorBodyGain = null;           // lowpassed noise — the leaf of the door
let doorChainFilter = null, doorChainGain = null;         // high bandpass grains — the chain
let doorTimberFilter = null, doorTimberGain = null;       // mid-high Q bandpass — wood splitting
let doorFrameGain = null;                                 // the jamb ringing
let doorGroanGain = null;                                 // hinge/iron under load
// ---- persistent BARRIER FORCE-FIELD voice — TWO independent slots, [0] the contact and
// [1] the rebound, because those two events overlap in time and cannot share a pooled gain.
// Each slot is { tapFilter, tapGain, shellFilter, shellGain, subGain, partialGains[3] }.
// See the FIELD_VOICES table for what each layer is doing and why.
const MELEE_FIELD_SLOTS = [];

/** `wallstages.js`/`destruction/wall.js` STAGE_NAMES order — kept local so this module does
 * not need to import the destruction system just to label five array slots. */
const WALL_SFX = [
  // 0 wallpaper — soft paper tear: bright, short, quiet
  { freq: 3400, q: 1.3, type: 'bandpass', dur: 0.09, gain: 0.22, thump: null },
  // 1 plaster — coarse crumble: mid noise + a short dusty thump
  { freq: 1200, q: 0.9, type: 'bandpass', dur: 0.16, gain: 0.34, thump: { f0: 130, f1: 70, dur: 0.10, gain: 0.22 } },
  // 2 lath — splinters: higher, snappier, a bit resonant (reads as crackle, not thud)
  { freq: 2100, q: 3.2, type: 'bandpass', dur: 0.13, gain: 0.34, thump: { f0: 340, f1: 210, dur: 0.05, gain: 0.14 } },
  // 3 beam — the framing: heavy low thud, long decay, the loudest before the breach itself
  { freq: 500, q: 0.7, type: 'lowpass', dur: 0.24, gain: 0.42, thump: { f0: 110, f1: 48, dur: 0.22, gain: 0.34 } },
  // 4 open — the breach: broadband boom, the longest tail in the set
  { freq: 340, q: 0.5, type: 'lowpass', dur: 0.42, gain: 0.55, thump: { f0: 80, f1: 34, dur: 0.36, gain: 0.46 } },
];

// ------------------------------------------------------------------ deterministic variation
//
// Copied from `game/run.js`'s `hash32`/`mulberry32`/`seedRand` ON PURPOSE, not imported — see
// that file's own note ("eight lines of arithmetic is a cheaper dependency than a GPU"); this
// module has the same reason to stay decoupled from a gameplay file. `seedRand(seed, salt)` is
// STATELESS: no sequence, no order dependence, so pinning a seed and knowing which SALT a call
// used is enough to reproduce its exact jitter, without this module having to store or replay
// any RNG cursor.
function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mulberry32Step(a) {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seedRand(seed, salt) { return mulberry32Step(hash32(`${seed}|${salt}`)); }

let _audioSeed = 0x5eed;     // default — overridable so a capture/test can pin the whole sequence
let _meleeHit = 0;           // increments once per playMeleeImpact call — the jitter "salt"
let _gunHit = 0;             // same idea for the gunshot, which retriggers up to ~8x/s
let _wallHit = 0;            // same idea for wall-stage crossings

/**
 * 🚨 **OFFLINE-RENDER ISOLATION — A LYING INSTRUMENT THAT HAD ALREADY BEEN SHIPPING A FALSE
 * NUMBER.** `_renderOffline` swaps the module's `ctx` and every voice for an
 * `OfflineAudioContext`, then awaits `startRendering()`. In a LIVE game page that await spans
 * many animation frames — and `views/game.js:1103` calls `setHunterThreat(hunter.threat,
 * hunter.committed)` **every single frame**. Those calls landed on the offline graph and
 * overwrote the automation the test had just scheduled, dragging the drone back toward the
 * game's real threat (~0.0) for the whole render.
 *
 * Measured 2026-08-09. `_audio1-wiring.mjs` renders 0.8 s of `setHunterThreat(0.9, true)` and
 * asserts the peak exceeds 0.01. Same call, same code, in a page with no game loop:
 * **peak 0.0925**. In `game.play`: **peak 0.0079** — an 11.7x under-read, i.e. the check had
 * been passing on roughly a tenth of the signal it thought it was measuring, and would have
 * gone red for any tuning change larger than that accidental margin. It is not specific to the
 * hunter: any `_renderOffline` taken from a live page was contaminated by whatever the game
 * happened to be doing during the await.
 *
 * The gate: while a render is in flight, ONLY the caller's own trigger may drive the graph.
 * Everything the game does is dropped for those few milliseconds of wall time.
 */
let _offlineCtx = null;      // the OfflineAudioContext currently rendering, or null
let _inTrigger = false;      // true only while a caller-supplied trigger function is executing
const renderLocked = () => _offlineCtx !== null && !_inTrigger;

/** Pin the jitter sequence for every per-hit voice (melee, gun, wall) and reset their call
 * counters, so a fresh render/capture starting from this call is fully reproducible — e.g.
 * render depth 0.3 twice with nothing else in between and expect the SAME two waveforms, or
 * render a 90-hit dig and expect the SAME 90 waveforms next time. See `harness/scenarios/
 * _audio1-wiring.mjs` for both uses. */
export function seedAudioVariation(seed) {
  _audioSeed = seed >>> 0;
  _meleeHit = 0; _gunHit = 0; _wallHit = 0;
  // 📺 the show cues take the same pinning — a captured Reckoning has to reproduce the SAME
  // three taps next time, or an audio ref of the night loop is a fresh dice roll per run.
  _showHit = 0; _evictHit = 0;
}

// ------------------------------------------------------------------ small curve helpers
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
/** Piecewise-linear interpolation across explicit (x, y) anchors, clamped flat past both
 * ends. Used to shape every `playMeleeImpact` parameter across depth from the named points in
 * `task-audio.md` §3.1's table (~0, ~0.3, ~0.7) without hard-coding a step function — the
 * timbre is a continuous function of depth, the table is just where it was described. */
function curve(d, pts) {
  if (d <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (d <= x1) return lerp(y0, y1, (d - x0) / (x1 - x0));
  }
  return pts[pts.length - 1][1];
}

// ------------------------------------------------------------------ melee impact tuning
//
// 🎧 RETUNED 2026-08-09 BY `audio-listen-1`, THE FIRST PASS EVER MADE WITH THE SOUND AUDIBLE.
// `harness/audio-render.mjs` renders these voices to `refs/audio/*.wav`. Measured on the
// PREVIOUS values, off the written files:
//
//   depth 0.00  peak -22.5 dBFS  RMS -51.1 dB   <- inaudible
//   depth 0.35  peak  -9.6 dBFS  RMS -33.2 dB
//   depth 0.70  peak -16.2 dBFS  RMS -42.1 dB
//   depth 1.00  peak  -4.7 dBFS  RMS -34.3 dB   <- LOUDEST THING IN THE GAME
//
// Two defects fall straight out of that table and neither is visible from a spectrum check:
//
//   🚨 **THE LADDER WAS A VOLUME KNOB WITH THE BARRIER AT THE TOP.** The wall you CANNOT break
//      hit 18 dB harder than a fresh surface and 13 dB harder than a spent one, so the game's
//      biggest, punchiest, most rewarding impact was the one that means "give up and go
//      somewhere else". The reward signal was inverted.
//   🚨 **DEPTH 0 WAS ALMOST SILENT (peak 0.075), AND IT IS THE ONLY VALUE ORDINARY WALLS EVER
//      SEND.** `wall.js`'s scalar arm returns a hard-coded `depthAt: 0` for every panel in the
//      house that has no damage field, so a sledgehammer swung anywhere outside a dig wall
//      produced a tick you would not notice over footsteps. See `playMeleeImpact`'s header.
//
// So: **an 8 kg hammer always delivers 8 kg.** Depth changes WHICH LAYERS SPEAK, not how loud
// the blow is — five layers (crack / body / grit / lath / cavity) whose PRESENCE is a function
// of depth, rather than one bandpass being swept, because "reads as material, not as a filter
// sweep" is the actual brief. Gains across 0..0.85 now sit inside ~4 dB of each other.
//
// The reference is a real sledgehammer on lath-and-plaster:
//   d~0.0  the skin — paper and the plaster face. Bright dry CRACK, real body, no tail.
//   d~0.3  into the plaster — the biggest blow in the set. Broad crunch, deep body, and the
//          richest GRIT, because this is where the wall actually falls out of itself.
//   d~0.7  through to the lath and the cavity — the plaster is gone, so the grit thins out and
//          two new things appear: a pitched wooden SNAP (lath is springy sawn timber, it cracks
//          with a note in it) and the CAVITY itself, a box behind the hole that now rings.
//   d~1.0  NOT a material at all. See FIELD_VOICES — the barrier is a force field, and the
//          reason it is not on this ladder is that it is not made of anything.
const MELEE_CURVES = {
  impactFreq: [[0, 4100], [0.3, 1500], [0.7, 2200]],     // Hz — bright/thin -> big/low -> tight/dry
  impactQ: [[0, 3.0], [0.3, 0.8], [0.7, 1.4]],           // resonance — crisp -> broadband -> tighter
  impactGain: [[0, 0.52], [0.3, 0.60], [0.7, 0.42]],     // was 0.30/0.58/0.30 — the shallow end was the bug
  impactDur: [[0, 0.035], [0.3, 0.13], [0.7, 0.070]],    // seconds — short crack -> full crunch -> tight snap

  // The body. A hammer always lands with its full mass; what changes with depth is how much of
  // that mass couples into something that can move, so it drops in PITCH and lengthens rather
  // than fading out. (Old thumpGain at d=0 was 0.05 — five percent of a sledgehammer.)
  thumpF0: [[0, 240], [0.3, 150], [0.7, 122]],
  thumpF1: [[0, 128], [0.3, 46], [0.7, 52]],
  thumpDur: [[0, 0.055], [0.3, 0.17], [0.7, 0.115]],
  thumpGain: [[0, 0.27], [0.3, 0.40], [0.7, 0.25]],

  // Grit — plaster falling after the blow. Richest in the plaster band, thinning once there is
  // no plaster left to fall. Rendered as DISCRETE GRAINS, not one lowpass swell; see the tail
  // loop in `playMeleeImpact` for why a smooth envelope here read as "whoosh", not "grit".
  gritAmt: [[0, 0.03], [0.3, 0.30], [0.7, 0.14]],
  gritDur: [[0, 0.07], [0.3, 0.38], [0.7, 0.22]],
  gritFreq: [[0, 3200], [0.3, 2500], [0.7, 1900]],

  // Lath — silent until the plaster is off, then the loudest new thing in the deep half. High-Q
  // so it has a discernible PITCH; that pitch is what makes it read as wood rather than as more
  // noise, and it is the single most recognisable component of "hammer going through a wall".
  // ⚠️ these numbers look large next to the other layers and are not: a Q~5 BANDPASS PASSES A
  // SMALL FRACTION OF A WHITE-NOISE BURST'S ENERGY, so the gain that reaches the bus is roughly
  // a quarter of the figure here. Measured at d=0.7 with lathAmt 0.34 the 0.6-1.3 kHz band sat
  // 22 dB under the blow's own peak — i.e. the layer was scheduled, non-zero, and inaudible,
  // which is this project's favourite kind of bug.
  lathAmt: [[0, 0], [0.40, 0], [0.62, 0.90], [0.88, 0.66]],
  lathFreq: [[0.45, 1600], [0.70, 1150], [0.95, 940]],
  lathDur: [[0.45, 0.055], [0.70, 0.075], [0.95, 0.060]],

  // The cavity behind the wall, once there is a hole to speak through. Grows with depth and
  // drops in pitch as the hole widens — this is the layer that makes deep hits read as HOLLOW
  // instead of merely quieter, which is what "progressively deader as you dig into cavity"
  // actually sounds like.
  cavityAmt: [[0, 0], [0.38, 0.02], [0.70, 0.17], [0.95, 0.21]],
  cavityFreq: [[0.35, 430], [0.70, 300], [1.0, 238]],
  cavityDur: [[0.35, 0.09], [0.70, 0.17], [1.0, 0.20]],
};

/**
 * 🎯 THE BARRIER — A FORCE FIELD, NOT A CLANK. It is the one sound that has to state a RULE
 * with no text, and it is now on its third design because each of the first two was wrong in a
 * way only listening could show.
 *
 * ROUND 1 (`audio-1`/`audio-3`, never heard by anyone): peak −4.7 dBFS, centroid 300 Hz, a
 * 95 -> 55 Hz sine at gain 0.24 as its loudest element. Not a clank — a **kick drum**, and the
 * biggest, most satisfying hit in the game, 18 dB over a fresh wall. A player hearing it learns
 * "this spot is great", the exact inverse of the message. The reward signal was inverted.
 *
 * ROUND 2 (`audio-listen-1`, the first pass made with the sound audible): inharmonic metal —
 * a 3.1 kHz bandpass tick, a small 165 -> 118 Hz mass, four inharmonic partials in the metal
 * register, plus a rebound second contact at 44 ms. Quietest and brightest melee sound in the
 * game (−6.7 dBFS peak, −39.5 RMS, centroid 819 Hz, 12 ms decay), which fixed the inversion.
 * **John heard it and named the problem: it is a good clank, and a clank is a material.**
 *   *"I think it could sound more like a force field when you hit the barrier. like a non
 *    natural shock absorption sound."*
 *
 * ROUND 3 — THIS ONE. The blow has to be absorbed by something that is not matter. Four
 * decisions carry that, and every one of them is a deliberate violation of how a struck object
 * behaves:
 *
 *   · ⚡ **THE ENVELOPE SWELLS INTO THE CONTACT INSTEAD OF STARTING AT IT.** Every other sound
 *     in this file reaches peak in 0.7 ms because that is what a physical transient does. The
 *     field's amplitude RISES over ~40% of the event and then collapses. Nothing in the natural
 *     world does that — the energy appears to be drawn in rather than released — and it is the
 *     single strongest "this is not a material" cue available for free.
 *   · **IT ENDS AT EXACTLY ZERO, ON A STRAIGHT LINE.** Every envelope below is scheduled as a
 *     run of `linearRampToValueAtTime` points ending on a hard 0, not an exponential decay
 *     toward a floor. Exponential decay IS the sound of a room; a field has no room in it. The
 *     abrupt stop is the "no tail" claim, and it is now literal rather than approximate.
 *   · **THE ENERGY GOES SOMEWHERE, AUDIBLY.** Each event sweeps: the noise shell's centre
 *     frequency travels across the whole event and its Q travels with it, and the partials
 *     chirp. Direction is the design choice that separates the three voices below — inward and
 *     down reads as swallowed, outward and up reads as dispersed.
 *   · **INHARMONIC BUT NOT METAL.** Round 2's partials were 1180/2270/3510/5100 — the bell
 *     register, which is why it read as steel. These sit at irrational ratios in the 250 Hz -
 *     1 kHz range with a seeded amplitude FLUTTER on top (a 70-130 Hz warble scheduled straight
 *     into the envelope points, costing no extra node). A warble at that rate is not something a
 *     struck object can do; it is the tell that this is a field and not a plate.
 *
 * 🔔 **THE REBOUND SURVIVES, IN ALL THREE VOICES.** Hard things throw a hammer back and nobody
 * needs that explained; a field would throw it back harder. It is still a discrete second event
 * at 36-62 ms (jittered so a run of duds never becomes a mechanical double-tick), and it still
 * runs on its own chain so it can overlap the first. What changed is its timbre: it is no longer
 * a smaller copy of the contact but an OUTWARD one — the sweep inverts, so the second event
 * always travels up and away from you. Kept, not replaced.
 *
 * ⚠️ Two chains ("slots"), not one. Round 2 shared one pooled gain between both contacts and had
 * to schedule the rebound strictly after the first had decayed. These envelopes are 30-110 ms
 * and the rebound starts at 44 ms, so they MUST be allowed to overlap; two independent slots is
 * the whole fix and it costs sixteen nodes built once per context.
 */
const FIELD_ENV_POINTS = 18;   // automation points per envelope — enough to carry a 130 Hz flutter

/**
 * 🚨 **THE ONE NUMBER THAT KEEPS THE REWARD SIGNAL THE RIGHT WAY ROUND. DO NOT RAISE IT.**
 *
 * Round 1's barrier was 18 dB over a fresh wall and taught players that a dud spot was the best
 * hit in the game. Round 2 fixed that with a 12 ms tick: −6.7 dBFS peak but only −39.5 dB RMS,
 * because almost nothing was there. A force field is a 50-110 ms EVENT, not a tick, so at equal
 * peak it carries several times the energy — the first render of round 3 measured −9.0 dBFS peak
 * (fine) and **−33.9 dB RMS, which is 4.5 dB LOUDER than a fresh wall** (−38.4). Peak alone said
 * the inversion was fixed and RMS said it was creeping back; a longer sound is louder at the same
 * peak and that is exactly the trap this file fell into the first time.
 *
 * The invariant, checked against `refs/audio/01..04`: **the barrier must be the quietest melee
 * sound on BOTH peak and RMS.** This constant is what holds it there. At 0.46, clip `04` measures
 * **−16.8 dBFS peak / −39.6 dB RMS** against a fresh wall's −8.6 / −38.4 — i.e. it carries the
 * same energy as round 2's barrier did (−39.5 RMS) and a tenth of its peak, because the same
 * energy spread over 90 ms instead of 12 ms simply cannot spike as high. **Judge this sound by
 * RMS, not by peak.** A field that absorbs a blow should not punch, and the low crest factor is
 * the measurement saying it does not.
 */
const FIELD_LEVEL = 0.46;

/**
 * Three readings of "force field", switchable by `setBarrierVoice()` so `harness/audio-render.mjs`
 * can render all three side by side and John can pick from sound rather than from a description
 * (`refs/audio/04a`, `04b`, `04c`). The one named by `DEFAULT_BARRIER_VOICE` is what the game
 * plays; the other two exist to be judged against it and cost nothing but this table.
 *
 * Per event: `dur` seconds · `swell` = fraction of the event spent rising · `swellCurve` /
 * `fallCurve` = exponents on those two ramps (>1 = slower start, <1 = faster) · `flutterHz` /
 * `flutterAmt` = the synthetic warble · `shell` = bandpass noise that sweeps f0 -> f1 and Q
 * q0 -> q1 · `sub` = low sine, the sense of mass · `partials` = inharmonic sines, `chirp` is the
 * factor its pitch travels by across the event · `tap` = an optional instant dry contact.
 */
const FIELD_VOICES = {
  // ── A "SWALLOWED": no impact sound at all. The blow is drawn in, hums for 50 ms in a register
  //    no wall occupies, and stops dead. The shell sweeps DOWN and NARROWS (2.6 kHz -> 520 Hz,
  //    Q 0.9 -> 3.6) — energy funnelling inward to nothing. The most literal reading of John's
  //    words and the biggest departure from a struck object.
  swallow: {
    contact: {
      dur: 0.055, swell: 0.46, swellCurve: 1.7, fallCurve: 1.15, flutterHz: 74, flutterAmt: 0.34,
      tap: null,
      shell: { f0: 2600, f1: 520, q0: 0.9, q1: 3.6, gain: 0.34, durMul: 1.0 },
      sub: { f0: 118, f1: 84, gain: 0.075, durMul: 0.80 },
      partials: [
        { f: 415, chirp: 0.86, gain: 0.145, durMul: 0.92 },
        { f: 596, chirp: 0.83, gain: 0.100, durMul: 0.78 },
        { f: 947, chirp: 0.80, gain: 0.062, durMul: 0.60 },
      ],
    },
    rebound: {
      at: 0.044, scale: 0.40,
      dur: 0.030, swell: 0.12, swellCurve: 1.0, fallCurve: 1.6, flutterHz: 118, flutterAmt: 0.22,
      tap: null,
      shell: { f0: 900, f1: 4300, q0: 1.3, q1: 0.5, gain: 0.42, durMul: 1.0 },
      sub: null,
      partials: [
        { f: 1180, chirp: 1.90, gain: 0.075, durMul: 0.70 },
        { f: 1873, chirp: 2.10, gain: 0.050, durMul: 0.55 },
      ],
    },
  },

  // ── B "SHOVED": you DO feel a contact — a dull, dead 780 Hz tap with no brightness and no
  //    ring, the sound of hitting something that gives nothing back — and then the field
  //    answers. The contact sinks (1.5 kHz -> 300 Hz, partials chirping down 0.62x) and the
  //    rebound is the loudest part of the event, sweeping 700 Hz -> 5 kHz in 28 ms. The safest
  //    of the three: it keeps a recognisable moment of impact, so it cannot be misread as
  //    "my swing did not register".
  shove: {
    contact: {
      dur: 0.050, swell: 0.30, swellCurve: 1.5, fallCurve: 1.3, flutterHz: 88, flutterAmt: 0.30,
      tap: { f: 780, q: 1.6, dur: 0.008, gain: 0.20 },
      shell: { f0: 1500, f1: 300, q0: 1.0, q1: 2.6, gain: 0.26, durMul: 1.0 },
      sub: { f0: 150, f1: 62, gain: 0.10, durMul: 0.95 },
      partials: [
        { f: 268, chirp: 0.62, gain: 0.150, durMul: 1.00 },
        { f: 431, chirp: 0.66, gain: 0.105, durMul: 0.82 },
        { f: 733, chirp: 0.70, gain: 0.055, durMul: 0.62 },
      ],
    },
    rebound: {
      at: 0.044, scale: 0.56,
      dur: 0.028, swell: 0.06, swellCurve: 0.85, fallCurve: 1.8, flutterHz: 132, flutterAmt: 0.18,
      tap: null,
      shell: { f0: 700, f1: 5000, q0: 0.7, q1: 0.4, gain: 0.46, durMul: 1.0 },
      sub: null,
      partials: [
        { f: 905, chirp: 2.20, gain: 0.070, durMul: 0.75 },
        { f: 1487, chirp: 2.40, gain: 0.045, durMul: 0.55 },
      ],
    },
  },

  // ── C "DISPERSED": the blow instantly stops being a point and becomes a widening wash that
  //    climbs away from you. The shell opens rather than sweeps — Q 9 -> 0.35 while the centre
  //    travels 420 Hz -> 3.6 kHz — and all three partials rise by ~3x. Longest of the three
  //    (110 ms) but the amplitude is falling for 95% of it and it still ends on a hard zero.
  disperse: {
    contact: {
      dur: 0.110, swell: 0.09, swellCurve: 1.0, fallCurve: 1.9, flutterHz: 96, flutterAmt: 0.26,
      tap: null,
      // ⚠️ q0 was 9.0 and it CLIPPED — peak 0.9999, five samples at full scale, on one hit in
      // five. A biquad whose centre frequency and Q are both being swept hard is a time-varying
      // filter and can ring far past unity while it settles; 420 Hz -> 3.6 kHz at Q 9 is about
      // as hard as that sweep gets. 4.2 stopped the clipping but still left one hit in five
      // 4.6 dB above its neighbours — the same instability, just under the ceiling. 2.8 is the
      // first value where the five hits of `04c` sit level. It still audibly opens. Measured.
      shell: { f0: 420, f1: 3600, q0: 2.8, q1: 0.35, gain: 0.34, durMul: 1.0 },
      sub: { f0: 96, f1: 70, gain: 0.055, durMul: 0.30 },
      partials: [
        { f: 330, chirp: 2.97, gain: 0.105, durMul: 0.85 },
        { f: 505, chirp: 2.86, gain: 0.072, durMul: 0.70 },
        { f: 869, chirp: 2.70, gain: 0.046, durMul: 0.52 },
      ],
    },
    rebound: {
      at: 0.044, scale: 0.38,
      dur: 0.042, swell: 0.10, swellCurve: 1.0, fallCurve: 1.7, flutterHz: 126, flutterAmt: 0.22,
      tap: null,
      shell: { f0: 1600, f1: 6200, q0: 1.1, q1: 0.45, gain: 0.36, durMul: 1.0 },
      sub: null,
      partials: [
        { f: 1310, chirp: 2.05, gain: 0.060, durMul: 0.70 },
        { f: 2090, chirp: 2.25, gain: 0.038, durMul: 0.50 },
      ],
    },
  },
};

/** 🎯 WHAT THE GAME PLAYS. Change this one string to ship a different reading. */
const DEFAULT_BARRIER_VOICE = 'swallow';
let _barrierVoice = DEFAULT_BARRIER_VOICE;

/**
 * Pick which force-field reading the barrier plays. Exists for `harness/audio-render.mjs`, which
 * renders all three into `refs/audio/` so the choice is made by ear. Nothing in the game calls
 * it — the game gets `DEFAULT_BARRIER_VOICE`.
 *
 * ⚠️ **A NAME IT DOES NOT KNOW RESETS TO THE SHIPPED VOICE, IT DOES NOT KEEP THE OLD ONE.** This
 * is module state and the harness renders a dozen clips through one page: "ignore and keep" means
 * a typo in clip 04a silently re-voices clips 05 through 08 as well, and the WAVs would look
 * perfectly healthy. Sticky global state that fails quietly is exactly how this project gets lied
 * to; resetting is the failure mode a measurement can catch.
 */
export function setBarrierVoice(name) {
  _barrierVoice = FIELD_VOICES[name] ? name : DEFAULT_BARRIER_VOICE;
  return _barrierVoice;
}

/** Deterministic pool so two hits at the SAME depth are not the same hit — perturbs Q (how
 * resonant the crack reads), envelope length, and the field partials' ratio, independent of the
 * pitch/gain/timing jitter every hit already gets. WIDENED from three entries to five: measured
 * on the old build, four consecutive barrier hits (`refs/audio/05-barrier-x4.wav`) differed by a
 * mean of only **1.77 dB and 5.6% centroid** — real, but thin cover for ninety blows. */
const MELEE_VARIANTS = [
  { qMul: 1.00, durMul: 1.00, ratioMul: 1.000, lathMul: 1.00 },
  { qMul: 1.34, durMul: 0.84, ratioMul: 1.043, lathMul: 1.12 },
  { qMul: 0.72, durMul: 1.21, ratioMul: 0.958, lathMul: 0.86 },
  { qMul: 1.12, durMul: 1.09, ratioMul: 1.086, lathMul: 0.94 },
  { qMul: 0.86, durMul: 0.91, ratioMul: 0.921, lathMul: 1.21 },
];

/**
 * NEW for `audio-3`: seeded, not `Math.random()`. Found by the re-seed check in
 * `_audio1-wiring.mjs` — pinning `_audioSeed` and re-rendering the SAME `playMeleeImpact` call
 * still came back a different waveform (max|Δ| = 0.14) even though every envelope/filter
 * parameter was bit-identical, because the shared noise SAMPLE DATA itself was rebuilt with
 * plain `Math.random()` on every `_renderOffline` call. `seedRand(seed, salt)` at 44100 draws
 * still sounds like white noise (uniform, no audible periodicity) — this is a determinism fix,
 * not a timbre change. Every voice that plays noise (gun, wall stages, melee) inherits it.
 */
function buildNoiseBuffer(c, seconds = 1.0) {
  const n = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = seedRand(_audioSeed, `noise|${i}`) * 2 - 1;
  return buf;
}

function buildGunVoice(c) {
  gunFilter = c.createBiquadFilter();
  gunFilter.type = 'bandpass';
  gunFilter.frequency.value = 2600;
  gunFilter.Q.value = 1.0;
  gunGain = c.createGain();
  gunGain.gain.value = 0;
  gunFilter.connect(gunGain);
  gunGain.connect(master);

  gunThumpGain = c.createGain();
  gunThumpGain.gain.value = 0;
  gunThumpGain.connect(master);

  // NEW: a short low-passed noise "body" layer beneath the bandpass crack. A bandpass click
  // alone reads as a toy (§3.2's own words) — this adds the chest-thump air-pressure component
  // a real gunshot has, without lengthening the sound enough to blur the 0.13 s cooldown into
  // a buzz at max fire rate.
  gunBodyFilter = c.createBiquadFilter();
  gunBodyFilter.type = 'lowpass';
  gunBodyFilter.frequency.value = 650;
  gunBodyFilter.Q.value = 0.6;
  gunBodyGain = c.createGain();
  gunBodyGain.gain.value = 0;
  gunBodyFilter.connect(gunBodyGain);
  gunBodyGain.connect(master);
}

function buildWallVoices(c) {
  STAGE_VOICES.length = 0;
  for (const def of WALL_SFX) {
    const filter = c.createBiquadFilter();
    filter.type = def.type;
    filter.frequency.value = def.freq;
    filter.Q.value = def.q;
    const gain = c.createGain();
    gain.gain.value = 0;
    filter.connect(gain);
    gain.connect(master);

    const thumpGain = c.createGain();
    thumpGain.gain.value = 0;
    thumpGain.connect(master);
    STAGE_VOICES.push({ filter, gain, thumpGain });
  }
}

/** ONE oscillator pair, started once, left running for the whole session — see the file
 * header on pooling. Silent by default; `setHunterThreat` only ever automates gain/frequency. */
function buildHunterVoice(c) {
  huntCarrier = c.createOscillator();
  huntCarrier.type = 'sine';
  huntCarrier.frequency.value = 56;
  huntCarrierGain = c.createGain();
  huntCarrierGain.gain.value = 0;
  huntCarrier.connect(huntCarrierGain);
  huntCarrierGain.connect(master);

  // NEW: a second carrier, slightly detuned. Two near-unison sines beat against each other at
  // under 1 Hz, which is what keeps a HELD threat level from reading as a flat drone — a
  // single pure sine is the most fatiguing waveform there is; two close ones make a living,
  // breathing throb even while `threat` itself is not changing.
  huntCarrier2 = c.createOscillator();
  huntCarrier2.type = 'sine';
  huntCarrier2.frequency.value = 56 * 1.016;
  huntCarrier2Gain = c.createGain();
  huntCarrier2Gain.gain.value = 0;
  huntCarrier2.connect(huntCarrier2Gain);
  huntCarrier2Gain.connect(master);

  // NEW: a thin high partial, silent until threat climbs. An escalation cue distinct from
  // "louder" — rising threat should read as a CHANGE IN CHARACTER, not just a volume knob.
  huntShimmer = c.createOscillator();
  huntShimmer.type = 'sine';
  huntShimmer.frequency.value = 56 * 15.2;   // inharmonic to the carriers, thin/high, not a chord
  huntShimmerGain = c.createGain();
  huntShimmerGain.gain.value = 0;
  huntShimmer.connect(huntShimmerGain);
  huntShimmerGain.connect(master);

  // amplitude LFO — tremolo into BOTH carriers' gain params, so "threat" reads as a pulse
  // (a heartbeat) rather than a constant drone that would mask everything else in the mix.
  huntLFO = c.createOscillator();
  huntLFO.type = 'sine';
  huntLFO.frequency.value = 0.6;
  huntLFODepth = c.createGain();
  huntLFODepth.gain.value = 0;
  huntLFO.connect(huntLFODepth);
  huntLFODepth.connect(huntCarrierGain.gain);
  huntLFODepth.connect(huntCarrier2Gain.gain);   // one LFO output can fan out to both params

  huntCarrier.start();
  huntCarrier2.start();
  huntShimmer.start();
  huntLFO.start();
}

/**
 * 🚪 The door-bang voice's persistent chains. Same pooling discipline as every other voice: built
 * once, gain/frequency automated per blow, never recreated.
 */
function buildDoorVoice(c) {
  doorSlamGain = c.createGain();
  doorSlamGain.gain.value = 0;
  doorSlamGain.connect(master);

  doorBodyFilter = c.createBiquadFilter();
  doorBodyFilter.type = 'lowpass';
  doorBodyFilter.frequency.value = 520;
  doorBodyFilter.Q.value = 0.8;
  doorBodyGain = c.createGain();
  doorBodyGain.gain.value = 0;
  doorBodyFilter.connect(doorBodyGain);
  doorBodyGain.connect(master);

  doorChainFilter = c.createBiquadFilter();
  doorChainFilter.type = 'bandpass';
  doorChainFilter.frequency.value = 3600;
  doorChainFilter.Q.value = 3.2;
  doorChainGain = c.createGain();
  doorChainGain.gain.value = 0;
  doorChainFilter.connect(doorChainGain);
  doorChainGain.connect(master);

  doorTimberFilter = c.createBiquadFilter();
  doorTimberFilter.type = 'bandpass';
  doorTimberFilter.frequency.value = 1250;
  doorTimberFilter.Q.value = 3.0;
  doorTimberGain = c.createGain();
  doorTimberGain.gain.value = 0;
  doorTimberFilter.connect(doorTimberGain);
  doorTimberGain.connect(master);

  doorFrameGain = c.createGain();
  doorFrameGain.gain.value = 0;
  doorFrameGain.connect(master);

  doorGroanGain = c.createGain();
  doorGroanGain.gain.value = 0;
  doorGroanGain.connect(master);
}

/** The melee-impact voice's persistent chains — see the module-level comment above the `let`s
 * for what each layer is. Built once, reused for every `playMeleeImpact` call for the life of
 * the session (or of one offline render), same pooling discipline as the other three voices. */
function buildMeleeVoice(c) {
  meleeImpactFilter = c.createBiquadFilter();
  meleeImpactFilter.type = 'bandpass';
  meleeImpactFilter.frequency.value = 2000;
  meleeImpactFilter.Q.value = 1.2;
  meleeImpactGain = c.createGain();
  meleeImpactGain.gain.value = 0;
  meleeImpactFilter.connect(meleeImpactGain);
  meleeImpactGain.connect(master);

  meleeThumpGain = c.createGain();
  meleeThumpGain.gain.value = 0;
  meleeThumpGain.connect(master);

  meleeDebrisFilter = c.createBiquadFilter();
  meleeDebrisFilter.type = 'lowpass';
  meleeDebrisFilter.frequency.value = 2000;
  meleeDebrisFilter.Q.value = 0.7;
  meleeDebrisGain = c.createGain();
  meleeDebrisGain.gain.value = 0;
  meleeDebrisFilter.connect(meleeDebrisGain);
  meleeDebrisGain.connect(master);

  // splintering lath — high-Q bandpass so the noise burst comes out PITCHED (sawn timber
  // cracks with a note in it); silent above the plaster band, see MELEE_CURVES.lathAmt
  meleeLathFilter = c.createBiquadFilter();
  meleeLathFilter.type = 'bandpass';
  meleeLathFilter.frequency.value = 1200;
  meleeLathFilter.Q.value = 4.8;
  meleeLathGain = c.createGain();
  meleeLathGain.gain.value = 0;
  meleeLathFilter.connect(meleeLathGain);
  meleeLathGain.connect(master);

  // the cavity behind the hole — one oscillator's worth of box resonance per hit
  meleeCavityGain = c.createGain();
  meleeCavityGain.gain.value = 0;
  meleeCavityGain.connect(master);

  // the barrier force field — two identical slots so the contact and its rebound can overlap
  MELEE_FIELD_SLOTS.length = 0;
  MELEE_FIELD_SLOTS.push(buildFieldSlot(c), buildFieldSlot(c));
}

/** One force-field chain: a dry contact tap, a sweeping bandpass noise "shell", a low sine for
 * mass, and three inharmonic partial gains. Every parameter is automated per hit; nothing here
 * is voice-specific, so all three FIELD_VOICES run through the same sixteen nodes. */
function buildFieldSlot(c) {
  const tapFilter = c.createBiquadFilter();
  tapFilter.type = 'bandpass';
  tapFilter.frequency.value = 800;
  tapFilter.Q.value = 1.5;
  const tapGain = c.createGain();
  tapGain.gain.value = 0;
  tapFilter.connect(tapGain);
  tapGain.connect(master);

  const shellFilter = c.createBiquadFilter();
  shellFilter.type = 'bandpass';
  shellFilter.frequency.value = 1200;
  shellFilter.Q.value = 1.0;
  const shellGain = c.createGain();
  shellGain.gain.value = 0;
  shellFilter.connect(shellGain);
  shellGain.connect(master);

  const subGain = c.createGain();
  subGain.gain.value = 0;
  subGain.connect(master);

  const partialGains = [];
  for (let i = 0; i < 3; i++) {
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(master);
    partialGains.push(g);
  }
  return { tapFilter, tapGain, shellFilter, shellGain, subGain, partialGains };
}

/**
 * ⚡ THE NON-PHYSICAL ENVELOPE, and the reason the barrier stopped sounding like an object.
 *
 * Scheduled as a run of `linearRampToValueAtTime` points rather than the attack/exponential-
 * decay pair every other voice in this file uses. Three properties fall out of that and all
 * three are the point:
 *   1. the amplitude can RISE INTO the contact (`swell` > 0) — no struck object does this;
 *   2. it ends on a hard **0**, not on an exponential's floor, so there is no tail and no room;
 *   3. a flutter can be baked straight into the points at no extra node cost — `flutterHz` is a
 *      70-130 Hz warble whose PHASE is drawn per hit, which is also a free anti-fatigue lever.
 * `phase` must come from the seeded stream, never `Math.random()` — see the determinism note.
 */
function fieldEnvelope(param, at, dur, peakV, ev, phase) {
  const N = FIELD_ENV_POINTS;
  param.cancelScheduledValues(at);
  param.setValueAtTime(0, at);
  for (let i = 1; i < N; i++) {
    const u = i / N;
    const a = u < ev.swell
      ? Math.pow(u / ev.swell, ev.swellCurve)
      : Math.pow(1 - (u - ev.swell) / (1 - ev.swell), ev.fallCurve);
    const fl = 1 + ev.flutterAmt * Math.sin(2 * Math.PI * ev.flutterHz * dur * u + phase);
    param.linearRampToValueAtTime(Math.max(0, peakV * a * fl), at + dur * u);
  }
  param.linearRampToValueAtTime(0, at + dur);
}

/**
 * Create (or resume) the shared AudioContext. Call this from `armPlayOverlay`'s click
 * handler ONLY — that is the user gesture the autoplay policy requires, and it is also
 * exactly the branch that never runs in capture (`if (!engine.capture) armPlayOverlay(...)`),
 * which is what keeps this whole module inert during a screenshot or a perf run.
 */
export function initAudio(engine) {
  if (engine?.capture) return;     // 🚨 capture must stay silent and inert — see file header
  if (ctx) {                        // already live (e.g. a second click) — just make sure it's running
    if (ctx.state === 'suspended') { const r = ctx.resume(); if (r?.catch) r.catch(() => {}); }
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;                // no Web Audio in this browser — silence, not a crash
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    master.connect(analyser);       // fan-out only; does not affect the audible path

    noiseBuffer = buildNoiseBuffer(ctx, 1.0);
    buildGunVoice(ctx);
    buildWallVoices(ctx);
    buildHunterVoice(ctx);
    buildMeleeVoice(ctx);
    buildDoorVoice(ctx);

    // ⚠️ MUST swallow the rejection — same class of bug `armPlayOverlay` already fixed once
    // for `requestPointerLock()`. `main.js`'s `unhandledrejection` handler paints a full-screen
    // "VIEW FAILED" over the whole game on ANY unhandled promise rejection.
    const r = ctx.resume();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    ctx = null; master = null; analyser = null;   // fail silent, never fail loud
  }
}

// ---------------------------------------------------------------- 1. THE GUN

/**
 * The most-repeated sound in the game — the nail gun's cooldown is 0.13 s, so this can fire
 * up to ~7-8 times a second. Short and dry on purpose (a percussive noise crack + a fast
 * pitch-dropped thump + a low body layer, all under 85 ms) so a held trigger reads as a
 * mechanism, not a tone.
 *
 * ⚠️ **THE JITTER WAS MEASURABLY TOO SMALL TO HEAR.** `refs/audio/10-gun-burst.wav` — twelve
 * shots at the real 0.13 s cooldown, rendered by `harness/audio-render.mjs` — came back with a
 * mean consecutive-shot difference of **0.43 dB and 2.6% spectral centroid**. That is under the
 * just-noticeable difference for loudness (~1 dB) on every shot, i.e. a held trigger was
 * arithmetically varied and audibly a buzz. Widened to ±9% pitch / ±22% gain, plus a 0-4 ms
 * start smear and a three-entry timbral pool so consecutive shots differ in COLOUR and not only
 * in level — the same anti-fatigue argument as melee, applied to the sound that repeats most.
 */
const GUN_VARIANTS = [
  { fMul: 1.00, qMul: 1.00, bodyMul: 1.00, durMul: 1.00 },
  { fMul: 1.17, qMul: 1.45, bodyMul: 0.78, durMul: 0.88 },
  { fMul: 0.86, qMul: 0.72, bodyMul: 1.24, durMul: 1.13 },
];

export function playGunshot() {
  if (!ctx || !gunFilter || renderLocked()) return;
  _gunHit++;
  const jf = 1 + (seedRand(_audioSeed, `gf|${_gunHit}`) - 0.5) * 0.18;
  const jg = 1 + (seedRand(_audioSeed, `gg|${_gunHit}`) - 0.5) * 0.44;
  const v = GUN_VARIANTS[Math.floor(seedRand(_audioSeed, `gv|${_gunHit}`) * GUN_VARIANTS.length)];
  const t = ctx.currentTime + seedRand(_audioSeed, `gt|${_gunHit}`) * 0.004;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.connect(gunFilter);
  gunFilter.frequency.setValueAtTime(2600 * jf * v.fMul, t);
  gunFilter.Q.setValueAtTime(1.0 * v.qMul, t);
  gunGain.gain.cancelScheduledValues(t);
  gunGain.gain.setValueAtTime(0.0001, t);
  gunGain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.56 * jg), t + 0.0008);
  gunGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 * v.durMul);
  // read from a different point in the shared noise buffer per shot — without this every shot
  // is literally the same 55 ms of samples through the same filter, which no amount of gain
  // jitter disguises
  src.start(Math.max(0, t - 0.001), seedRand(_audioSeed, `go|${_gunHit}`) * 0.5, 0.06);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(170 * jf, t);
  osc.frequency.exponentialRampToValueAtTime(58 * jf, t + 0.035);
  osc.connect(gunThumpGain);
  gunThumpGain.gain.cancelScheduledValues(t);
  gunThumpGain.gain.setValueAtTime(Math.max(0.001, 0.30 * jg), t);
  gunThumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 * v.durMul);
  osc.start(t);
  osc.stop(t + 0.06 * v.durMul + 0.01);

  // body: brief low-passed noise "chest thump" under the crack — see buildGunVoice.
  const bsrc = ctx.createBufferSource();
  bsrc.buffer = noiseBuffer;
  bsrc.connect(gunBodyFilter);
  gunBodyGain.gain.cancelScheduledValues(t);
  gunBodyGain.gain.setValueAtTime(0.0001, t);
  gunBodyGain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.22 * jg * v.bodyMul), t + 0.004);
  gunBodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
  bsrc.start(t, seedRand(_audioSeed, `gb|${_gunHit}`) * 0.5, 0.08);
}

// ---------------------------------------------------------------- 2. A WALL CROSSING A STAGE

/**
 * `docs/design/dig.md` makes how fast a wall gives way the player's search heuristic —
 * plaster crumbles, lath splinters, a beam thuds — so this has to differ audibly by stage,
 * not just play the same crack five times. `stage` is `DestructibleWall`'s own 0..4
 * (wallpaper, plaster, lath, beam, open) — the exact number `onBreak` already carries.
 * `chunks-1` is re-pointing this toward continuous depth this same wave — kept working and
 * untouched in shape (same signature, same five-stage table) rather than fought.
 * Light per-crossing jitter added (±3.5% pitch, ±7% gain) — this fires far less often than
 * melee or the gun (once per stage boundary, not once per hit), so it needed less, not none.
 */
export function playWallStage(stage) {
  if (!ctx || renderLocked()) return;
  const i = Math.max(0, Math.min(WALL_SFX.length - 1, stage | 0));
  const def = WALL_SFX[i];
  const voice = STAGE_VOICES[i];
  if (!voice) return;
  const t = ctx.currentTime;
  _wallHit++;
  const jf = 1 + (seedRand(_audioSeed, `wf|${_wallHit}`) - 0.5) * 0.07;
  const jg = 1 + (seedRand(_audioSeed, `wg|${_wallHit}`) - 0.5) * 0.14;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.connect(voice.filter);
  voice.filter.frequency.setValueAtTime(def.freq * jf, t);
  voice.gain.gain.cancelScheduledValues(t);
  voice.gain.gain.setValueAtTime(0.0001, t);
  voice.gain.gain.exponentialRampToValueAtTime(Math.max(0.0005, def.gain * jg), t + 0.006);
  voice.gain.gain.exponentialRampToValueAtTime(0.0001, t + def.dur);
  src.start(t, 0, def.dur + 0.01);

  if (def.thump) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(def.thump.f0 * jf, t);
    osc.frequency.exponentialRampToValueAtTime(def.thump.f1 * jf, t + def.thump.dur);
    osc.connect(voice.thumpGain);
    voice.thumpGain.gain.cancelScheduledValues(t);
    voice.thumpGain.gain.setValueAtTime(Math.max(0.0005, def.thump.gain * jg), t);
    voice.thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + def.thump.dur);
    osc.start(t);
    osc.stop(t + def.thump.dur + 0.02);
  }
}

// ---------------------------------------------------------------- 3. HUNTER PROXIMITY

/**
 * During a measured 26.6 s siege the hunter's `awareness` peaked at 0.06 — `hunter.threat`
 * (see `game/hunter-ai.js`) never rose past ~0.015, about 1.5% of the HUD's own channel — so
 * the player had no way to hear the thing hunting them at all. This is driven from the exact
 * same call as `hud.setThreat(hunter.threat, hunter.committed)` in `views/game.js`, so the
 * ear and the vignette can never disagree about how much danger is on screen.
 *
 * A pulsing low tone rather than a constant drone: `huntCarrierGain`'s baseline plus an LFO
 * tremolo (see `buildHunterVoice`) reads as a heartbeat that speeds up with threat, and jumps
 * to a faster, harder pulse the instant `committed` flips — mirroring the HUD's own
 * "presence is a mood, a committed hunter is an instruction" split (`ui/hud.js` `setThreat`).
 *
 * NEW, addressing "must not become a drone the player stops hearing" (§3.2): a slow two-rate
 * wander (`wander` below, driven off wall-clock `ctx.currentTime`, not a per-hit counter —
 * this cue is continuous, not discrete, so its variation has to be continuous too) keeps a
 * HELD threat level from settling into a static tone; a second, detuned carrier beats against
 * the first for the same reason; and a thin high shimmer partial fades in only once threat
 * passes ~0.15, so escalation reads as a change in CHARACTER, not just a louder knob.
 */
export function setHunterThreat(threat, committed = false) {
  if (!ctx || !huntCarrierGain || renderLocked()) return;
  const t = ctx.currentTime;
  const th = Math.max(0, Math.min(1, threat || 0));
  /**
   * 🚨 **GAIN STAGING — THIS VOICE USED TO CLIP THE MASTER BUS INTO DISTORTION.** Measured
   * 2026-08-09 off `refs/audio/12-hunter-ramp.wav`, an 18 s threat ramp rendered by
   * `harness/audio-render.mjs`: **peak 0.9999 (0.0 dBFS) with 3,850 hard-clipped samples**, at
   * an RMS of −14 dB — **21 dB louder than the entire melee bus**. The arithmetic: `baseline`
   * topped out at 0.36 while `huntLFODepth` added another 0.9 × 0.36 = 0.32 onto the SAME gain
   * param, giving one carrier 0.68, and there are two carriers plus a shimmer summing into a
   * 0.9 master. Nothing in the game could have been heard over a committed hunter, and what you
   * would have heard was digital distortion, not dread.
   *
   * Halved with the LFO share cut, so the worst case is now roughly
   * `(0.142 + 0.085) + 0.75 × (0.142 × 1.18) + 0.03 ≈ 0.38` before master — which leaves a full
   * melee hit (~0.45) room to land on top without the sum reaching 1.0. Character is unchanged:
   * same two-carrier beating, same wander, same shimmer threshold, same committed pulse rate.
   */
  const baseline = th < 0.03 ? 0 : 0.010 + Math.pow(th, 1.5) * (committed ? 0.085 : 0.062);

  const wander = Math.sin(t * 0.11) * 0.12 + Math.sin(t * 0.037 + 1.7) * 0.06;  // two incommensurate rates
  const baseline2 = baseline * (1 + wander);

  huntCarrierGain.gain.setTargetAtTime(baseline, t, 0.35);
  huntCarrier2Gain.gain.setTargetAtTime(baseline2 * 0.75, t, 0.4);   // slightly quieter, slightly out of step -> beating

  const rate = committed ? (2.6 + th * 2.2) : (0.5 + th * 1.6);
  huntLFO.frequency.setTargetAtTime(rate, t, 0.25);
  huntLFODepth.gain.setTargetAtTime(baseline * (committed ? 0.60 : 0.45), t, 0.35);

  const shimmer = th < 0.15 ? 0 : Math.pow((th - 0.15) / 0.85, 2) * (committed ? 0.030 : 0.014);
  huntShimmerGain.gain.setTargetAtTime(shimmer, t, 0.6);
}

// ---------------------------------------------------------------- 0. THE MELEE IMPACT (headline)

/**
 * `playMeleeImpact(depth01, opts)` — 0 = fresh surface, 1 = the cell is gone. `player.js`
 * calls this on the contact frame with `res.depthAt`; this module owns only the sound.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 🚨 **`depth01` ALONE CANNOT TELL A BARRIER FROM A BREAKTHROUGH, AND THE OLD CODE ASSUMED IT
 * COULD.** `depthAt` is "how much of this cell has been removed". It reaches 1.0 at a cyan
 * barrier — and it reaches 1.0 at every cell you successfully punch through, because
 * `damagefield.js` clamps `nd = min(1, d + inc)` for barrier and non-barrier cells alike
 * (`OPEN_AT = 0.999`). The previous version inferred the barrier purely from
 * `smoothstep(0.85, 1.0, depth)`, so **the "NOT HERE, move along" sound also fired on the moment
 * of success.** Measured, not suspected: driving the real `DamageField` with
 * `harness/audio-render.mjs`'s competent-aim trace, **10 of the last 48 blows of a WORKING dig
 * report `depthAt` exactly 1.0** and every one of them played the refusal sound.
 *
 * `opts` closes that hole. In order of authority:
 *   `{ barrier }`      — **THE RIGHT SIGNAL**: is there cyan behind THIS spot
 *                        (`field.barrierAt(u, v)`). `true` means the field fades in over the
 *                        last 3% of depth — you have taken all the material off and what is
 *                        left is the field. `false` means it can NEVER play here, however
 *                        deep the hole gets. Note it is `barrier AND bottomed out`: a dud spot
 *                        has cyan behind it from the first blow, and those first blows must
 *                        still sound like the plaster they are actually removing.
 *   `{ brokeThrough }` — forces the barrier layer OFF; the blow that opens the wall can never
 *                        be the refusal sound.
 *   `{ blocked }`      — **nothing at all came off.** Weakest on a face that HAS a damage field
 *                        (see the warning below) and the only true signal on one that does not.
 *                        ⚠️ **ITS RANK DID NOT CHANGE, THE CALLER DID (2026-08-15, `genexit-1`):**
 *                        `wall.js`'s scalar arm used to return a hard `barrier: false`, which
 *                        swallowed this branch and made a padlocked door and a door coming apart
 *                        the same sound. It now omits the key, because a stage panel has no cyan
 *                        behind it and ABSENT is the honest answer where `false` was a claim.
 * Omit `opts` entirely and the old depth-only inference runs unchanged, so nothing regresses
 * while the call site is out of this agent's ownership.
 *
 * ⚠️ **`blocked` ON ITS OWN IS NOT THE BARRIER AND I ALMOST SHIPPED THAT CLAIM.** My first cut
 * of this comment told `player.js` to pass `{ blocked: res.blocked }` and called it
 * authoritative. Then I measured it: driving a real all-barrier `DamageField` for a 63-blow
 * dig, **`blocked` (`removed <= 1e-6`) was true ZERO times.**
 * 🚨 **THAT ZERO IS TRUE OF THAT SYNTHETIC FIELD AND NOT OF A REAL FACE — CORRECTED 2026-08-15
 * (`genexit-1`, `_genexit1-clank.mjs`).** Re-measured with 63 real hammer blows at the shipped
 * x8 base on a real free dig face, 60% of them into one spot: **`blocked` was true 40 times.** A
 * bottomed-out spot really does refuse. The conclusion below is unchanged — `blocked` is still
 * the wrong signal for the cyan — but anyone reading the old zero as "this branch is unreachable
 * on the dig" will ship a regression, and one nearly did: see the note at the branch itself. The brush is 0.52 m across with a
 * 0.62 rim, so even swinging at a spot that bottomed out six blows ago there is always some
 * neighbouring cell still taking material, and `removed` stays above the epsilon essentially
 * forever. A refusal gated on `blocked` would almost never fire. Left in as a last-resort hint
 * only. **This is the whole reason a rendered WAV and a real drive beat a plausible-sounding
 * argument, twice in one slice.**
 *
 * ✅ **BOTH CALL-SITE CHANGES HAVE LANDED** (confirmed 2026-08-09, in files this module does not
 * own): `src/game/wall.js` `applyHit` returns `barrier: !!this.field.barrierAt(u, v)` from the
 * damage-field arm and a hard `false` from the scalar arm, and `src/game/player.js` passes the
 * whole result — `audioMod.playMeleeImpact?.(res.depthAt ?? 0, res)`. So the truth path above is
 * live in the game, not just available: the refusal sound no longer fires on the blow that
 * breaks through.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * FIVE LAYERS, not two, and depth selects WHICH SPEAK rather than turning one dial down — see
 * MELEE_CURVES for the reference each is imitating:
 *   crack (bandpass noise) · body (pitch-dropping triangle) · grit (granular lowpass noise) ·
 *   lath (high-Q pitched wood snap, deep only) · cavity (the hole ringing, deep only)
 * and the BARRIER layer, which replaces all five, crossfaded by `barrierMix`.
 *
 * ⚡ **ATTACK IS 0.7 ms, NOT 5 ms.** The old crack envelope took 5 ms to reach peak, which is
 * long enough that the hit reads as a "whump" arriving rather than as something being struck. A
 * real impact transient is sub-millisecond and it is most of what "satisfying" means here.
 *
 * Every hit draws deterministic jitter (±8% pitch, ±18% gain, 0-22 ms start smear) plus one of
 * five timbral variants from `seedRand` — widened from ±5%/±11%/three variants after measuring
 * only 1.77 dB and 5.6% centroid between consecutive same-depth blows on the old build. That is
 * what "survives ~90 blows" means mechanically: consecutive hits at the SAME depth are never
 * bit-identical, without the ladder itself becoming unpredictable.
 */
export function playMeleeImpact(depth01, opts = null) {
  if (!ctx || !meleeImpactFilter || renderLocked()) return;
  const d = clamp01(+depth01 || 0);
  const t = ctx.currentTime;

  _meleeHit++;
  const salt = _meleeHit;
  const jf = 1 + (seedRand(_audioSeed, `mf|${salt}`) - 0.5) * 0.16;   // ±8% pitch
  const jg = 1 + (seedRand(_audioSeed, `mg|${salt}`) - 0.5) * 0.36;   // ±18% loudness
  const jt = seedRand(_audioSeed, `mt|${salt}`) * 0.022;              // 0-22 ms start smear
  const variant = MELEE_VARIANTS[Math.floor(seedRand(_audioSeed, `mv|${salt}`) * MELEE_VARIANTS.length)];

  /**
   * Truth first, inference only as a fallback — see the header block above for why the order
   * is barrier > brokeThrough > blocked > depth, and why `blocked` is nearly useless alone.
   *
   * 🚨 **THIS ORDER IS UNCHANGED AND THAT IS A DELIBERATE SECOND CUT — `genexit-1`, 2026-08-15.**
   * The defect it was asked to fix is real: a padlocked door and a door coming apart made the
   * IDENTICAL sound, because `wall.js`'s scalar arm returned a hard `barrier: false`, and
   * `typeof false === 'boolean'` claimed the test below before `blocked` was ever consulted.
   * **The first cut moved `blocked` above `barrier` here, and its own control caught that as a
   * regression within one run:** 40 of 63 real hammer blows on a real free dig face report
   * `blocked` (hammer one spot at the shipped x8 base and it bottoms out), so that reorder would
   * have put the refusal clank on two dig blows in three. ⚠️ **AND IT MEANS THE "ZERO TIMES IN
   * 63 BLOWS" IN THIS FILE'S OWN WARNING BELOW IS TRUE ONLY OF THE SYNTHETIC ALL-BARRIER FIELD
   * IT WAS MEASURED ON, NOT OF A REAL FACE.** Corrected there.
   *
   * 🎯 **THE FIX WENT WHERE THE LIE WAS: `wall.js`'s scalar arm no longer claims a `barrier` it
   * does not have.** A stage panel has no cyan behind it, so the honest value is ABSENT, not
   * `false` — and with the key gone a refused scalar blow falls through to `blocked` exactly as
   * this ladder was designed to let it, while the field arm still passes a real boolean and is
   * never routed differently by one instruction. The dig is byte-identical, and
   * `_genexit1-clank.mjs` proves that by rendering both through this function rather than by
   * arguing it.
   */
  let barrierMix;
  if (opts && opts.brokeThrough) barrierMix = 0;
  else if (opts && typeof opts.barrier === 'boolean') barrierMix = opts.barrier ? smoothstep(0.97, 1.0, d) : 0;
  else if (opts && opts.blocked === true) barrierMix = 1;
  else barrierMix = smoothstep(0.85, 1.0, d);
  const woodMix = 1 - barrierMix;
  const t0 = t + jt;
  const ATK = 0.0007;   // seconds to peak — an impact, not a swell

  if (woodMix > 0.001) {
    // ---- CRACK: the contact itself. Brittle/bright at the skin, broad at the plaster, tighter
    // and drier once the plaster is spent.
    const freq = curve(d, MELEE_CURVES.impactFreq) * jf;
    const dur = Math.max(0.015, curve(d, MELEE_CURVES.impactDur) * variant.durMul);
    meleeImpactFilter.frequency.setValueAtTime(freq, t0);
    meleeImpactFilter.Q.setValueAtTime(curve(d, MELEE_CURVES.impactQ) * variant.qMul, t0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.connect(meleeImpactFilter);
    const gainV = curve(d, MELEE_CURVES.impactGain) * jg * woodMix;
    meleeImpactGain.gain.cancelScheduledValues(t0);
    meleeImpactGain.gain.setValueAtTime(0.0001, t0);
    meleeImpactGain.gain.exponentialRampToValueAtTime(Math.max(0.0005, gainV), t0 + ATK);
    meleeImpactGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    // start the noise a hair EARLY so the filter is already excited when the envelope opens —
    // otherwise the biquad's own settling time eats the first millisecond of the transient. The
    // read offset makes two hits draw DIFFERENT noise, not the same 55 ms of the shared buffer.
    src.start(Math.max(0, t0 - 0.001), seedRand(_audioSeed, `mo|${salt}`) * 0.5, dur + 0.02);

    // ---- BODY: the mass of the swing landing. Always present — a sledgehammer never lands light.
    const thumpDur = Math.max(0.015, curve(d, MELEE_CURVES.thumpDur) * variant.durMul);
    const thumpOsc = ctx.createOscillator();
    thumpOsc.type = 'triangle';
    thumpOsc.frequency.setValueAtTime(curve(d, MELEE_CURVES.thumpF0) * jf, t0);
    thumpOsc.frequency.exponentialRampToValueAtTime(Math.max(24, curve(d, MELEE_CURVES.thumpF1) * jf), t0 + thumpDur);
    thumpOsc.connect(meleeThumpGain);
    const thumpGainV = curve(d, MELEE_CURVES.thumpGain) * jg * woodMix;
    meleeThumpGain.gain.cancelScheduledValues(t0);
    meleeThumpGain.gain.setValueAtTime(Math.max(0.0005, thumpGainV), t0);
    meleeThumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + thumpDur);
    thumpOsc.start(t0);
    thumpOsc.stop(t0 + thumpDur + 0.02);

    // ---- LATH: a pitched wooden snap, silent until the plaster is off. High Q on the filter is
    // what gives it a note; without a note it is just more noise and the layer is wasted.
    //
    // 🎲 **LAYER DROPOUT IS THE STRONGEST ANTI-FATIGUE LEVER IN THIS FILE AND IT IS FREE.**
    // Gain and pitch jitter can only ever make the SAME sound slightly different; measured on
    // the retuned build, sixty-three consecutive dig blows still differed by a mean of just
    // 1.4 dB, which is around the just-noticeable difference. What actually varies between two
    // real hammer blows is WHETHER SOMETHING HAPPENS — this one split a lath, that one didn't;
    // this one brought a shower of plaster down, that one brought two crumbs. So lath and grit
    // are each present on only ~two hits in three, drawn from the same seeded stream as
    // everything else. Two neighbouring blows can now differ by a whole layer, not by a dB.
    const lathAmt = (seedRand(_audioSeed, `lp|${salt}`) < 0.68 ? 1 : 0)
      * curve(d, MELEE_CURVES.lathAmt) * jg * woodMix * variant.lathMul;
    if (lathAmt > 0.006) {
      const lathDur = Math.max(0.02, curve(d, MELEE_CURVES.lathDur) * variant.durMul);
      meleeLathFilter.frequency.setValueAtTime(curve(d, MELEE_CURVES.lathFreq) * jf * variant.ratioMul, t0);
      meleeLathFilter.Q.setValueAtTime(4.8 * variant.qMul, t0);
      const lsrc = ctx.createBufferSource();
      lsrc.buffer = noiseBuffer;
      lsrc.connect(meleeLathFilter);
      meleeLathGain.gain.cancelScheduledValues(t0);
      meleeLathGain.gain.setValueAtTime(0.0001, t0);
      meleeLathGain.gain.exponentialRampToValueAtTime(Math.max(0.0006, lathAmt), t0 + 0.0012);
      meleeLathGain.gain.exponentialRampToValueAtTime(0.0001, t0 + lathDur);
      lsrc.start(Math.max(0, t0 - 0.001), seedRand(_audioSeed, `ml|${salt}`) * 0.5, lathDur + 0.02);
    }

    // ---- CAVITY: the hole behind the wall, once there is one. Low, boxy, detuned per hit —
    // this is what makes deep blows read as HOLLOW rather than merely quieter, i.e. it is the
    // layer doing "progressively deader as you dig into cavity" as a material and not as an EQ.
    const cavAmt = curve(d, MELEE_CURVES.cavityAmt) * jg * woodMix;
    if (cavAmt > 0.005) {
      const cavDur = Math.max(0.04, curve(d, MELEE_CURVES.cavityDur));
      const cosc = ctx.createOscillator();
      cosc.type = 'sine';
      cosc.frequency.setValueAtTime(curve(d, MELEE_CURVES.cavityFreq) * jf * variant.ratioMul, t0);
      cosc.connect(meleeCavityGain);
      meleeCavityGain.gain.cancelScheduledValues(t0);
      meleeCavityGain.gain.setValueAtTime(0.0001, t0);
      meleeCavityGain.gain.exponentialRampToValueAtTime(Math.max(0.0006, cavAmt), t0 + 0.006);
      meleeCavityGain.gain.exponentialRampToValueAtTime(0.0001, t0 + cavDur);
      cosc.start(t0);
      cosc.stop(t0 + cavDur + 0.02);
    }

    // ---- GRIT: plaster falling after the blow.
    //
    // ⚠️ **THIS USED TO BE ONE SMOOTH SWELL AND THAT IS WHY IT READ AS "WHOOSH", NOT "GRIT".**
    // A 45 ms attack into a 340 ms decay on lowpassed noise is the envelope of wind. Real
    // falling plaster is DISCRETE — individual pieces landing at irregular intervals. Same one
    // pooled gain node, same one noise source; the only change is that the envelope is now a
    // run of 3-7 seeded grains of decreasing size scattered across the tail, which costs nothing
    // and is the difference between debris and a fade.
    const gritAmt = (seedRand(_audioSeed, `gp|${salt}`) < 0.66 ? 1 : 0.22)   // see LAYER DROPOUT above
      * curve(d, MELEE_CURVES.gritAmt) * jg * woodMix;
    if (gritAmt > 0.008) {
      const gritDur = Math.max(0.03, curve(d, MELEE_CURVES.gritDur));
      meleeDebrisFilter.frequency.setValueAtTime(curve(d, MELEE_CURVES.gritFreq) * jf, t0);
      const dsrc = ctx.createBufferSource();
      dsrc.buffer = noiseBuffer;
      dsrc.connect(meleeDebrisFilter);
      meleeDebrisGain.gain.cancelScheduledValues(t0);
      meleeDebrisGain.gain.setValueAtTime(0.0001, t0);
      const grains = 3 + Math.floor(seedRand(_audioSeed, `gn|${salt}`) * 5);   // 3..7
      let gt = t0 + 0.010 + seedRand(_audioSeed, `g0|${salt}`) * 0.02;
      for (let i = 0; i < grains && gt < t0 + gritDur; i++) {
        // grains get quieter and sparser as the tail runs out — that IS what settling sounds like
        const fall = 1 - i / grains;
        const amp = Math.max(0.0006, gritAmt * (0.35 + 0.65 * fall * fall)
          * (0.55 + seedRand(_audioSeed, `ga|${salt}|${i}`) * 0.9));
        const len = 0.012 + seedRand(_audioSeed, `gl|${salt}|${i}`) * 0.045;
        meleeDebrisGain.gain.exponentialRampToValueAtTime(amp, gt + 0.004);
        meleeDebrisGain.gain.exponentialRampToValueAtTime(0.0006, gt + len);
        gt += len * (0.75 + seedRand(_audioSeed, `gs|${salt}|${i}`) * 1.6);
      }
      meleeDebrisGain.gain.exponentialRampToValueAtTime(0.0001, Math.max(gt + 0.005, t0 + gritDur));
      dsrc.start(t0, seedRand(_audioSeed, `gb|${salt}`) * 0.5, gritDur + 0.10);
    }
  }

  if (barrierMix > 0.001 && MELEE_FIELD_SLOTS.length >= 2) {
    // ---- 🎯 THE BARRIER FORCE FIELD. Two events on two independent chains: the contact (which
    // swells INTO itself and sinks) and the rebound (which travels outward and away). See the
    // FIELD_VOICES block above for why each element is where it is; the short version is that
    // round 1 was a kick drum, round 2 was a good clank, and a clank is a material.
    const V = FIELD_VOICES[_barrierVoice] || FIELD_VOICES[DEFAULT_BARRIER_VOICE];
    const fieldJf = jf * variant.ratioMul;
    // 🎲 An EXTRA per-hit loudness draw on top of the ±18% every melee hit already gets, and it
    // is here because it was measured missing. `05-barrier-x4.wav` on round 2 spread 2.88 dB
    // between consecutive blows; the first render of round 3 managed only 1.69 dB, because a
    // swell-and-collapse envelope's peak is a max over eighteen points and therefore *less*
    // sensitive to jitter than a single exponential attack was. One blow in a dud sequence
    // being visibly softer than the last is most of what stops four in a row reading as a
    // machine. Drawn once per HIT, not per event, so the rebound belongs to the same blow.
    const hitAmp = 0.60 + seedRand(_audioSeed, `fa|${salt}`) * 0.80;   // 0.60 - 1.40, i.e. 7.4 dB

    /**
     * One field event. `tag` salts the seeded stream so the contact and the rebound draw
     * DIFFERENT flutter phases and sweep extents from the same hit — otherwise the rebound is a
     * transposed photocopy of the contact and the pair reads as one mechanical stamp.
     *
     * 🎲 `sweep` is this arm's version of the wood arm's LAYER DROPOUT: it scales the EXPONENT
     * on every frequency journey in the event, so one blow's shell falls two octaves and the
     * next one's falls one and a half. Gain jitter alone can only make the same sound quieter;
     * this makes it a different shape, which is what survives being heard four times in a row
     * at one dud spot.
     */
    const event = (slot, ev, at, scale, tag) => {
      const dur = Math.max(0.012, ev.dur * variant.durMul);
      const phase = seedRand(_audioSeed, `fp|${salt}|${tag}`) * Math.PI * 2;
      // 🎲 FOCUS — how much the layers land ON TOP of each other. The peak of a summed event is
      // set by whether its layers reach their maxima at the same instant, so jittering the swell
      // fraction (and, below, each partial's length independently) makes one blow a single
      // focused shove and the next a smeared one. It moves PEAK without moving energy, which is
      // the only honest way left to widen the loudness spread: `hitAmp` alone could not do it,
      // because peak is a max over two events and a max of two jittered things is *less*
      // variable than either. Measured: widening `hitAmp` by 18% moved the four-blow spread by
      // −0.13 dB. That is the kind of "fix" this file is supposed to catch.
      const evx = {
        swell: Math.max(0.04, Math.min(0.76, ev.swell * (0.74 + seedRand(_audioSeed, `fw|${salt}|${tag}`) * 0.52))),
        swellCurve: ev.swellCurve, fallCurve: ev.fallCurve,
        flutterHz: ev.flutterHz, flutterAmt: ev.flutterAmt,
      };
      const sweep = 0.62 + seedRand(_audioSeed, `fs|${salt}|${tag}`) * 0.80;   // how FAR it travels
      const amp = jg * hitAmp * barrierMix * scale * FIELD_LEVEL;
      // 🎲 TILT — the strongest centroid lever in this arm. It rebalances the two halves of the
      // timbre against each other: high tilt is a hit that is mostly moving AIR (the noise
      // shell), low tilt is a hit that is mostly the field HUMMING (the partials). Neither is a
      // quieter version of the other, which is the whole difference between variation an ear
      // notices and variation only a meter does.
      const tilt = 0.60 + seedRand(_audioSeed, `fb|${salt}|${tag}`) * 0.90;    // 0.60 - 1.50
      const partialTilt = Math.max(0.42, 1.92 - tilt);

      // ---- TAP: an optional dry contact. Present only in the "shoved" voice, where the point
      // is that you feel something land before the field answers. Instant attack, ~8 ms, dull.
      if (ev.tap && ev.tap.gain > 0) {
        slot.tapFilter.frequency.cancelScheduledValues(at);
        slot.tapFilter.frequency.setValueAtTime(ev.tap.f * fieldJf, at);
        slot.tapFilter.Q.cancelScheduledValues(at);
        slot.tapFilter.Q.setValueAtTime(ev.tap.q * variant.qMul, at);
        const tsrc = ctx.createBufferSource();
        tsrc.buffer = noiseBuffer;
        tsrc.connect(slot.tapFilter);
        const tapDur = ev.tap.dur * variant.durMul;
        slot.tapGain.gain.cancelScheduledValues(at);
        slot.tapGain.gain.setValueAtTime(Math.max(0.0006, ev.tap.gain * amp), at);
        slot.tapGain.gain.linearRampToValueAtTime(0, at + tapDur);
        tsrc.start(Math.max(0, at - 0.0005), seedRand(_audioSeed, `ft|${salt}|${tag}`) * 0.5, tapDur + 0.01);
      } else {
        slot.tapGain.gain.cancelScheduledValues(at);
        slot.tapGain.gain.setValueAtTime(0, at);
      }

      // ---- SHELL: bandpass noise whose centre AND width travel across the event. This is the
      // layer that says where the energy went — down and narrowing (swallowed) or up and
      // widening (dispersed). The read offset gives every hit different noise, which is also
      // most of the measured centroid spread between consecutive blows.
      if (ev.shell) {
        const sDur = Math.max(0.010, dur * ev.shell.durMul);
        const f0 = ev.shell.f0 * jf;
        const f1 = Math.max(60, Math.min(18000, ev.shell.f0 * Math.pow(ev.shell.f1 / ev.shell.f0, sweep) * jf));
        slot.shellFilter.frequency.cancelScheduledValues(at);
        slot.shellFilter.frequency.setValueAtTime(f0, at);
        slot.shellFilter.frequency.exponentialRampToValueAtTime(f1, at + sDur);
        slot.shellFilter.Q.cancelScheduledValues(at);
        slot.shellFilter.Q.setValueAtTime(Math.max(0.1, ev.shell.q0 * variant.qMul), at);
        slot.shellFilter.Q.linearRampToValueAtTime(Math.max(0.1, ev.shell.q1 * variant.qMul), at + sDur);
        const ssrc = ctx.createBufferSource();
        ssrc.buffer = noiseBuffer;
        ssrc.connect(slot.shellFilter);
        fieldEnvelope(slot.shellGain.gain, at, sDur, Math.max(0.0006, ev.shell.gain * amp * tilt), evx, phase);
        ssrc.start(Math.max(0, at - 0.001), seedRand(_audioSeed, `fn|${salt}|${tag}`) * 0.5, sDur + 0.02);
      }

      // ---- SUB: a sense of mass, deliberately too small to be a thump. You swung 8 kg and it
      // went nowhere; the low end is what makes "nowhere" feel like it cost something.
      // Dropped on ~1 hit in 4 — see the wood arm's LAYER DROPOUT note for why that matters.
      if (ev.sub && seedRand(_audioSeed, `fu|${salt}|${tag}`) < 0.76) {
        const uDur = Math.max(0.012, dur * ev.sub.durMul);
        const uosc = ctx.createOscillator();
        uosc.type = 'sine';
        uosc.frequency.setValueAtTime(ev.sub.f0 * jf, at);
        uosc.frequency.exponentialRampToValueAtTime(Math.max(24, ev.sub.f1 * jf), at + uDur);
        uosc.connect(slot.subGain);
        fieldEnvelope(slot.subGain.gain, at, uDur, Math.max(0.0006, ev.sub.gain * amp), evx, phase);
        uosc.start(at);
        uosc.stop(at + uDur + 0.02);
      } else {
        slot.subGain.gain.cancelScheduledValues(at);
        slot.subGain.gain.setValueAtTime(0, at);
      }

      // ---- PARTIALS: inharmonic, mid register, chirping. Not the bell register round 2 used —
      // that is exactly what made it read as steel. The flutter rides these hardest.
      for (let i = 0; i < slot.partialGains.length; i++) {
        const p = ev.partials[i];
        const g = slot.partialGains[i];
        if (!g) continue;
        // the top two partials drop out on ~1 hit in 3 and ~1 in 5 — a whole layer of difference
        // between neighbouring blows, which gain jitter can never buy
        const dropRoll = seedRand(_audioSeed, `fq|${salt}|${tag}|${i}`);
        if (!p || (i === 2 && dropRoll < 0.34) || (i === 1 && dropRoll < 0.20)) {
          g.gain.cancelScheduledValues(at);
          g.gain.setValueAtTime(0, at);
          continue;
        }
        // each partial's LENGTH is drawn independently — see FOCUS above. Same total energy,
        // different alignment of the three maxima, therefore a different peak and a different
        // shape from one blow to the next.
        const pDur = Math.max(0.010, dur * p.durMul * (0.70 + seedRand(_audioSeed, `fd|${salt}|${tag}|${i}`) * 0.66));
        const pf = p.f * fieldJf;
        const posc = ctx.createOscillator();
        posc.type = 'sine';
        posc.frequency.setValueAtTime(pf, at);
        posc.frequency.exponentialRampToValueAtTime(
          Math.max(24, Math.min(18000, pf * Math.pow(p.chirp, sweep))), at + pDur);
        posc.connect(g);
        fieldEnvelope(g.gain, at, pDur, Math.max(0.0006, p.gain * amp * partialTilt), evx, phase);
        posc.start(at);
        posc.stop(at + pDur + 0.02);
      }
    };

    event(MELEE_FIELD_SLOTS[0], V.contact, t0, 1, 'c');
    // 🔔 the rebound, on its own chain so it may overlap the contact. Jittered in time so a run
    // of duds never becomes a mechanical double-tick at a fixed interval, and jittered in
    // strength so it is not the same shove twice.
    const reboundScale = V.rebound.scale * (0.72 + seedRand(_audioSeed, `fg|${salt}`) * 0.56);
    event(MELEE_FIELD_SLOTS[1], V.rebound,
      t0 + V.rebound.at * (0.82 + seedRand(_audioSeed, `fr|${salt}`) * 0.42), reboundScale, 'r');
  }
}

// ---------------------------------------------------------------------------
// 🚪 THE DOOR BANG — the hunter working on a chained door
// ---------------------------------------------------------------------------

/**
 * Layer curves against `escalation` (0 = first blow on an untouched door, 1 = it is through).
 * Read exactly like `MELEE_CURVES`, through `curve()`.
 *
 * 🎯 **THE ESCALATION IS A CHANGE OF MATERIAL, NOT A VOLUME KNOB, AND THAT IS THE WHOLE BRIEF.**
 * *"the player must be able to hear how close it is to getting through"* — a gain ramp cannot say
 * that, because the player has no reference for how loud loud is and the same ramp reads as the
 * hunter simply getting nearer. What DOES say it is the sound changing what it is made of:
 *
 *   · the SLAM drops in pitch and lengthens — the door is looser, so more of it moves
 *   · the CHAIN goes from a tight tick to a long loose rattle — the staple is working free
 *   · the TIMBER layer does not exist at all below ~0.3 and is the loudest new thing by 0.8 —
 *     that is the door splitting, and it is the one layer whose ARRIVAL is the information
 *   · the FRAME ring gets longer and lower — the jamb is no longer holding it
 *   · the GROAN only ever appears in the last third
 *
 * So blows 1 and 5 differ by three whole layers and about an octave, not by 6 dB. The lesson is
 * `playMeleeImpact`'s own LAYER DROPOUT note, applied to a ramp instead of to variation.
 */
const DOOR_CURVES = {
  // The mass of it. Lower and longer as the leaf comes loose.
  //
  // ⚠️ **THE FIRST NUMBERS HERE WERE WRONG AND THE BAND SPLIT IS WHAT SAID SO.** At
  // `slamGain 0.26 / slamDur 0.16` on blow one, the rendered clip measured **98.9% of its energy
  // under 300 Hz** — the chain and the timber were scheduled, non-zero and inaudible under the
  // slam, and the escalation from blow 1 to blow 6 came back as a 5.7 dB level rise with the band
  // shares MOVING THE WRONG WAY (98.9% -> 99.5% low). That is precisely the "louder, not different
  // material" failure this table's own header forbids, and the centroid could not see it: 295 Hz
  // against 270 Hz, a 25 Hz difference across the whole mechanic. It is `MELEE_CURVES`'
  // `lathAmt` note arriving a second time — *"a Q~5 bandpass passes a small fraction of a white
  // noise burst's energy"* — so the fix is on both sides: the low end comes down at the START
  // (an early blow is a hard tight KNOCK, not a boom) and the two bright layers go up ~3x.
  slamF0: [[0, 190], [0.5, 124], [1, 86]],
  slamF1: [[0, 84], [0.5, 46], [1, 33]],
  slamDur: [[0, 0.085], [0.5, 0.20], [1, 0.36]],
  slamGain: [[0, 0.15], [0.5, 0.27], [1, 0.40]],
  // The leaf itself — broad lowpassed noise, the "wooden" part of the impact. Brighter early:
  // a door that has not started to give is a hard flat panel, not a drum.
  bodyFreq: [[0, 1150], [0.5, 700], [1, 430]],
  bodyDur: [[0, 0.065], [0.5, 0.13], [1, 0.22]],
  bodyGain: [[0, 0.34], [0.5, 0.34], [1, 0.30]],
  // THE CHAIN. Tight tick -> loose rattle. `grains` is the count of discrete strikes.
  chainFreq: [[0, 4200], [0.5, 3400], [1, 2700]],
  chainSpan: [[0, 0.075], [0.5, 0.165], [1, 0.290]],   // seconds the rattle is spread over
  chainGrains: [[0, 4], [0.5, 8], [1, 13]],
  chainGain: [[0, 0.90], [0.5, 0.82], [1, 0.72]],
  // The split. ZERO until the door is genuinely giving — its arrival is the tell.
  timberAmt: [[0, 0], [0.28, 0], [0.55, 1.20], [1, 1.80]],
  timberFreq: [[0.3, 1500], [0.7, 1080], [1, 860]],
  timberDur: [[0.3, 0.05], [0.7, 0.085], [1, 0.115]],
  // The jamb ringing after the blow — a door in a wall, not a hit in space.
  frameF: [[0, 232], [0.5, 168], [1, 122]],
  frameDur: [[0, 0.06], [0.5, 0.14], [1, 0.26]],
  frameGain: [[0, 0.035], [0.5, 0.070], [1, 0.100]],
  // Hinge iron under load. Last third only.
  groanAmt: [[0, 0], [0.62, 0], [0.82, 0.075], [1, 0.115]],
  groanF0: [[0.6, 320], [1, 214]],
  groanF1: [[0.6, 232], [1, 138]],
};

let _doorHit = 0;

/**
 * 🚪 **ONE BLOW ON A CHAINED DOOR.** `HunterAI._bang` fires one of these every `BANG_CADENCE`
 * seconds; `views/game.js` is the call site and owns the distance term.
 *
 * @param {number} escalation  0..1 — `HunterAI.doorProgress(panel)`, i.e. how much of the door is
 *                             actually gone. Read off the wall's own health, never a blow counter.
 * @param {object} [opts]
 * @param {number} [opts.distance]  metres from the listener. Level only, no filtering and no
 *                                  panning — see the note below.
 * @param {number} [opts.throughWall] 0..1, how much wall is between. Rolls the top off.
 *
 * ⚠️ **NO PANNER, AND THAT IS DELIBERATE.** The entire graph in this file is MONO — every voice
 * connects straight to `master`, and `_renderOffline` builds a **1-channel** `OfflineAudioContext`,
 * which is what makes `harness/audio-render.mjs` (the only way anyone has ever heard this game)
 * able to render it at all. A `StereoPannerNode` here would upmix the bus and silently change
 * every other clip in that harness. **Direction is carried in the world instead** — the dust puff
 * on the door and the HUD callout naming it — which is also the only channel that works when the
 * door is behind you.
 */
export function playDoorBang(escalation = 0, opts = null) {
  if (!ctx || !doorSlamGain || renderLocked()) return;
  const e = clamp01(+escalation || 0);
  const t = ctx.currentTime;
  _doorHit++;
  const salt = _doorHit;

  // Same deterministic jitter discipline as every other voice — see the header. A door takes six
  // blows and the player hears every one of them; six identical bangs is the fatigue failure.
  const jf = 1 + (seedRand(_audioSeed, `df|${salt}`) - 0.5) * 0.14;
  const jg = 1 + (seedRand(_audioSeed, `dg|${salt}`) - 0.5) * 0.28;
  const t0 = t + seedRand(_audioSeed, `dt|${salt}`) * 0.010;

  // ---- DISTANCE. `1/(1+d/ref)` rather than inverse-square: the design wants a bang two rooms
  // away to still be a threat, and true inverse-square puts it under the room tone at 12 m.
  const dist = Math.max(0, opts?.distance ?? 0);
  const near = 1 / (1 + dist / 7.0);
  // Wall between? Roll the top off — the low end is what gets through masonry, and this is the
  // cue that says "not in this room". Applied to the two bright layers only.
  const muffle = 1 - 0.72 * clamp01(opts?.throughWall ?? 0);
  const amp = near * jg;
  if (amp < 0.004) return;      // too far to be worth scheduling six oscillators for

  // ---- SLAM: the mass. Triangle rather than sine so there is a little edge on it; a pure sine
  // at 100 Hz is a kick drum, and this must not be the most satisfying sound in the game (the
  // barrier's round-1 note is the whole cautionary tale).
  {
    const dur = curve(e, DOOR_CURVES.slamDur);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(curve(e, DOOR_CURVES.slamF0) * jf, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, curve(e, DOOR_CURVES.slamF1) * jf), t0 + dur);
    osc.connect(doorSlamGain);
    const g = curve(e, DOOR_CURVES.slamGain) * amp;
    doorSlamGain.gain.cancelScheduledValues(t0);
    doorSlamGain.gain.setValueAtTime(Math.max(0.0005, g), t0);
    doorSlamGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // ---- BODY: the leaf of the door. Broad, dull, short.
  {
    const dur = curve(e, DOOR_CURVES.bodyDur);
    doorBodyFilter.frequency.setValueAtTime(curve(e, DOOR_CURVES.bodyFreq) * jf, t0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.connect(doorBodyFilter);
    const g = curve(e, DOOR_CURVES.bodyGain) * amp;
    doorBodyGain.gain.cancelScheduledValues(t0);
    doorBodyGain.gain.setValueAtTime(0.0001, t0);
    doorBodyGain.gain.exponentialRampToValueAtTime(Math.max(0.0005, g), t0 + 0.0009);
    doorBodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.start(Math.max(0, t0 - 0.001), seedRand(_audioSeed, `db|${salt}`) * 0.5, dur + 0.02);
  }

  // ---- CHAIN: DISCRETE GRAINS, not one swell. Same finding the grit tail records — a smooth
  // envelope over a bandpass reads as "whoosh"; a chain is a countable number of small metal
  // impacts and it has to be scheduled as one. This layer is the mechanic's signature: it is what
  // makes the sound a CHAINED door rather than a heavy knock.
  {
    const span = curve(e, DOOR_CURVES.chainSpan);
    const n = Math.max(2, Math.round(curve(e, DOOR_CURVES.chainGrains)));
    const base = curve(e, DOOR_CURVES.chainFreq) * jf;
    const gTop = curve(e, DOOR_CURVES.chainGain) * amp * muffle;
    doorChainGain.gain.cancelScheduledValues(t0);
    doorChainGain.gain.setValueAtTime(0.0001, t0);
    for (let i = 0; i < n; i++) {
      const u = i / Math.max(1, n - 1);
      // Grains cluster at the front and straggle: a chain jumps hard on the impact then settles.
      const at = t0 + span * (u * u * 0.92 + seedRand(_audioSeed, `dcx|${salt}|${i}`) * 0.09);
      const gv = gTop * (1 - u * 0.78) * (0.55 + seedRand(_audioSeed, `dcg|${salt}|${i}`) * 0.9);
      doorChainFilter.frequency.setValueAtTime(
        base * (0.72 + seedRand(_audioSeed, `dcf|${salt}|${i}`) * 0.7), at);
      const gs = ctx.createBufferSource();
      gs.buffer = noiseBuffer;
      gs.connect(doorChainFilter);
      doorChainGain.gain.setValueAtTime(Math.max(0.0001, gv), at);
      doorChainGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.019);
      gs.start(at, seedRand(_audioSeed, `dco|${salt}|${i}`) * 0.5, 0.026);
    }
  }

  // ---- TIMBER: the split. Absent below ~0.28 escalation. Its ARRIVAL is the information.
  {
    const a = curve(e, DOOR_CURVES.timberAmt) * amp * muffle;
    if (a > 0.006) {
      const dur = curve(e, DOOR_CURVES.timberDur);
      doorTimberFilter.frequency.setValueAtTime(curve(e, DOOR_CURVES.timberFreq) * jf, t0 + 0.004);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.connect(doorTimberFilter);
      doorTimberGain.gain.cancelScheduledValues(t0);
      doorTimberGain.gain.setValueAtTime(0.0001, t0 + 0.003);
      doorTimberGain.gain.exponentialRampToValueAtTime(Math.max(0.0006, a), t0 + 0.0055);
      doorTimberGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.004 + dur);
      src.start(Math.max(0, t0 + 0.002), seedRand(_audioSeed, `dw|${salt}`) * 0.5, dur + 0.02);
    }
  }

  // ---- FRAME: the jamb ringing after the blow. Two detuned sines so it beats rather than
  // whistles, and it OUTLASTS the impact — that tail is what places the sound in a wall.
  {
    const dur = curve(e, DOOR_CURVES.frameDur);
    const f = curve(e, DOOR_CURVES.frameF) * jf;
    const g = curve(e, DOOR_CURVES.frameGain) * amp;
    doorFrameGain.gain.cancelScheduledValues(t0);
    doorFrameGain.gain.setValueAtTime(Math.max(0.0004, g), t0 + 0.008);
    doorFrameGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.008 + dur);
    for (const mul of [1, 1.026]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * mul, t0);
      o.frequency.linearRampToValueAtTime(f * mul * 0.94, t0 + dur);
      o.connect(doorFrameGain);
      o.start(t0 + 0.006);
      o.stop(t0 + 0.02 + dur);
    }
  }

  // ---- GROAN: hinge iron taking a load it is losing. Last third only, and it BENDS — a pitch
  // that slides is the one thing in the set that does not read as an impact at all.
  {
    const a = curve(e, DOOR_CURVES.groanAmt) * amp;
    if (a > 0.004) {
      const dur = 0.34;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(curve(e, DOOR_CURVES.groanF0) * jf, t0 + 0.02);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, curve(e, DOOR_CURVES.groanF1) * jf), t0 + 0.02 + dur);
      o.connect(doorGroanGain);
      doorGroanGain.gain.cancelScheduledValues(t0);
      doorGroanGain.gain.setValueAtTime(0.0001, t0 + 0.02);
      doorGroanGain.gain.exponentialRampToValueAtTime(Math.max(0.0004, a), t0 + 0.09);
      doorGroanGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02 + dur);
      o.start(t0 + 0.02);
      o.stop(t0 + 0.06 + dur);
    }
  }
}

// ---------------------------------------------------------------- test/debug hooks
//
// Headless verification cannot judge timbre, but it CAN measure real samples off `analyser`
// rather than trusting that a function ran — see `harness/scenarios/_audio1-wiring.mjs`.
// Exposed the same way `core/engine.js` exposes `window.__rrr`.
//
// `_renderOffline` exists because a live `AudioContext`'s destination depends on this
// machine actually having a working audio output device — and a headless CI/sandbox box is
// not guaranteed to have one. `OfflineAudioContext` renders the SAME graph-building code
// (`buildGunVoice`/`buildWallVoices`/`buildHunterVoice`/`buildMeleeVoice`/`buildNoiseBuffer`
// all just take a `BaseAudioContext` and don't care which kind) to a plain sample buffer with
// no dependency on hardware, a real clock, or wall time — it is the standard way to assert
// WebAudio DSP output without a sound card. This calls the EXACT SAME exported `playGunshot` /
// `playWallStage` / `setHunterThreat` / `playMeleeImpact` the game calls, just against a
// swapped-in offline context, so a pass here is evidence about the real functions, not a
// reimplementation.
//
// EXTENDED for `audio-3` in two backward-compatible ways (existing callers destructuring
// `{peak, samples, sampleRate}` are unaffected):
//   `opts.raw`      — also return the rendered channel data as a plain array, for a caller
//                      that wants to run its own spectral analysis (see the melee spectral-
//                      distinctness check in `_audio1-wiring.mjs`).
//   `opts.windowMs` — also return an array of per-window RMS values instead of the full
//                      buffer, for checking a LONG render (e.g. a 90-hit, 60 s dig) stays
//                      alive throughout without transferring several million samples.
//   `trigger` as an ARRAY of `{t, fn}` instead of a plain function — each `fn` is invoked via
//   `OfflineAudioContext.suspend(t)/.resume()` so `ctx.currentTime` genuinely reads `t` inside
//   it. Needed because a single synchronous `trigger()` call only ever sees `currentTime`
//   at the START of the render — calling `playMeleeImpact` 90 times in a plain function all
//   stacks the hits at t=0. A plain function keeps working exactly as before.
export async function _renderOffline(trigger, seconds = 0.5, opts = {}) {
  const { raw = false, windowMs = 0 } = opts;
  const savedCtx = ctx, savedMaster = master, savedAnalyser = analyser, savedNoise = noiseBuffer;
  const savedGunFilter = gunFilter, savedGunGain = gunGain, savedGunThump = gunThumpGain;
  const savedGunBodyFilter = gunBodyFilter, savedGunBodyGain = gunBodyGain;
  const savedStageVoices = STAGE_VOICES.slice();
  const savedHC = huntCarrier, savedHCG = huntCarrierGain, savedHL = huntLFO, savedHLD = huntLFODepth;
  const savedHC2 = huntCarrier2, savedHC2G = huntCarrier2Gain;
  const savedHS = huntShimmer, savedHSG = huntShimmerGain;
  const savedMIF = meleeImpactFilter, savedMIG = meleeImpactGain, savedMTG = meleeThumpGain;
  const savedMDF = meleeDebrisFilter, savedMDG = meleeDebrisGain;
  const savedMLF = meleeLathFilter, savedMLG = meleeLathGain, savedMCVG = meleeCavityGain;
  const savedFieldSlots = MELEE_FIELD_SLOTS.slice();
  const savedDSG = doorSlamGain, savedDBF = doorBodyFilter, savedDBG = doorBodyGain;
  const savedDCF = doorChainFilter, savedDCG = doorChainGain;
  const savedDTF = doorTimberFilter, savedDTG = doorTimberGain;
  const savedDFG = doorFrameGain, savedDGG = doorGroanGain;
  try {
    const OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OfflineCtor(1, Math.ceil(seconds * 44100), 44100);
    ctx = off;
    _offlineCtx = off;      // 🔒 from here until `finally`, only `trigger` may drive the graph
    master = off.createGain();
    master.gain.value = 0.9;
    master.connect(off.destination);
    analyser = null;
    noiseBuffer = buildNoiseBuffer(off, 1.0);
    buildGunVoice(off);
    buildWallVoices(off);
    buildHunterVoice(off);
    buildMeleeVoice(off);
    buildDoorVoice(off);

    // `_inTrigger` is the ONLY window in which the exported voices are allowed to act while a
    // render is in flight — see the OFFLINE-RENDER ISOLATION note near `_audioSeed`.
    const fire = (fn) => { _inTrigger = true; try { fn(); } catch { /* keep rendering */ } finally { _inTrigger = false; } };
    if (Array.isArray(trigger)) {
      for (const { t: hitT, fn } of trigger) {
        off.suspend(hitT).then(() => { fire(fn); off.resume(); }).catch(() => {});
      }
    } else {
      fire(trigger);
    }

    const rendered = await off.startRendering();
    const data = rendered.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));

    let windows;
    if (windowMs > 0) {
      const winSamples = Math.max(1, Math.round(rendered.sampleRate * windowMs / 1000));
      windows = [];
      for (let i = 0; i < data.length; i += winSamples) {
        const end = Math.min(data.length, i + winSamples);
        let sum = 0;
        for (let j = i; j < end; j++) sum += data[j] * data[j];
        windows.push(Math.sqrt(sum / (end - i)));
      }
    }

    return {
      peak, samples: data.length, sampleRate: rendered.sampleRate,
      raw: raw ? Array.from(data) : undefined,
      windows,
    };
  } finally {
    _offlineCtx = null; _inTrigger = false;   // 🔓 the game may drive the live graph again
    ctx = savedCtx; master = savedMaster; analyser = savedAnalyser; noiseBuffer = savedNoise;
    gunFilter = savedGunFilter; gunGain = savedGunGain; gunThumpGain = savedGunThump;
    gunBodyFilter = savedGunBodyFilter; gunBodyGain = savedGunBodyGain;
    STAGE_VOICES.length = 0; STAGE_VOICES.push(...savedStageVoices);
    huntCarrier = savedHC; huntCarrierGain = savedHCG; huntLFO = savedHL; huntLFODepth = savedHLD;
    huntCarrier2 = savedHC2; huntCarrier2Gain = savedHC2G;
    huntShimmer = savedHS; huntShimmerGain = savedHSG;
    meleeImpactFilter = savedMIF; meleeImpactGain = savedMIG; meleeThumpGain = savedMTG;
    meleeDebrisFilter = savedMDF; meleeDebrisGain = savedMDG;
    meleeLathFilter = savedMLF; meleeLathGain = savedMLG; meleeCavityGain = savedMCVG;
    MELEE_FIELD_SLOTS.length = 0; MELEE_FIELD_SLOTS.push(...savedFieldSlots);
    doorSlamGain = savedDSG; doorBodyFilter = savedDBF; doorBodyGain = savedDBG;
    doorChainFilter = savedDCF; doorChainGain = savedDCG;
    doorTimberFilter = savedDTF; doorTimberGain = savedDTG;
    doorFrameGain = savedDFG; doorGroanGain = savedDGG;
  }
}

/**
 * Furniture material break — ceramic / brass / stone / canvas / wood.
 * Separate from `playMeleeImpact` so a vase shatter does not reuse wall plaster depth curves.
 * `opts.final` true = shatter; false = intermediate chip.
 */
let _furnHit = 0;
export function playFurnBreak(material = 'wood', opts = null) {
  if (!ctx || !master || renderLocked() || !noiseBuffer) return;
  const final = opts?.final !== false;
  const t = ctx.currentTime;
  _furnHit++;
  const salt = _furnHit;
  const jf = 1 + (seedRand(_audioSeed, `ff|${salt}`) - 0.5) * 0.18;
  const jg = 1 + (seedRand(_audioSeed, `fg|${salt}`) - 0.5) * 0.32;
  const t0 = t + seedRand(_audioSeed, `ft|${salt}`) * 0.012;
  const mat = String(material || 'wood');

  // Tuned by material family — short transient + body + optional bright shatter grains.
  const table = {
    ceramic: { crackF: 3200, crackQ: 1.4, crackG: 0.55, bodyF: 420, bodyG: 0.22, grains: final ? 7 : 2 },
    brass:   { crackF: 2400, crackQ: 4.5, crackG: 0.42, bodyF: 280, bodyG: 0.18, grains: final ? 5 : 1 },
    stone:   { crackF: 900,  crackQ: 0.9, crackG: 0.48, bodyF: 110, bodyG: 0.34, grains: final ? 4 : 1 },
    canvas:  { crackF: 1800, crackQ: 1.1, crackG: 0.38, bodyF: 200, bodyG: 0.16, grains: final ? 4 : 1 },
    wood:    { crackF: 1400, crackQ: 1.6, crackG: 0.44, bodyF: 160, bodyG: 0.26, grains: final ? 5 : 2 },
  }[mat] ?? { crackF: 1400, crackQ: 1.6, crackG: 0.44, bodyF: 160, bodyG: 0.26, grains: final ? 5 : 2 };

  const amp = (final ? 1.0 : 0.55) * jg;

  // crack — bandpassed noise
  {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = table.crackF * jf;
    f.Q.value = table.crackQ;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, table.crackG * amp), t0 + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (final ? 0.12 : 0.06));
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + 0.18);
  }
  // body — pitch-dropping triangle
  {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(table.bodyF * jf, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, table.bodyF * 0.35 * jf), t0 + (final ? 0.14 : 0.07));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, table.bodyG * amp), t0 + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (final ? 0.18 : 0.08));
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + 0.22);
  }
  // shatter grains — short bright ticks spread over ~90 ms
  const nGrain = table.grains | 0;
  for (let i = 0; i < nGrain; i++) {
    const gt = t0 + 0.012 + i * (final ? 0.014 : 0.02);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = (mat === 'ceramic' ? 2800 : 1600) * (0.85 + seedRand(_audioSeed, `fg2|${salt}|${i}`) * 0.4);
    const g = ctx.createGain();
    const gg = (final ? 0.22 : 0.10) * amp * (0.6 + seedRand(_audioSeed, `fg3|${salt}|${i}`) * 0.5);
    g.gain.setValueAtTime(0.0001, gt);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, gg), gt + 0.0006);
    g.gain.exponentialRampToValueAtTime(0.0001, gt + 0.028);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(gt); src.stop(gt + 0.05);
  }
}

/* ===========================================================================================
 * 📺 PRIME TIME — THE SHOW CUES, and the leak rule that governs them.
 *
 * The night loop shipped SILENT. Nothing in `src/party/` or `src/views/party-*.js` had ever
 * called this module: every voice above is dig/combat semantics (a gun, a wall stage, a chained
 * door, a hunter closing) and none of them means anything on a television. Renaming
 * `playDoorBang` to "eviction" would have been the cheap version and the wrong one — the
 * escalation curve, the chain rattle and the hinge groan are all saying *the hunter is coming
 * through a door*, which is a fact the TV must not assert.
 *
 * So: two new voices, both PRIME TIME by construction.
 *
 *   `playNameLanded(cue)`  the Reckoning. A name lands on the board. A dry gavel-ish block tap:
 *                          a short bandpassed slap, a pitched wooden body dropping about a
 *                          fifth, and a thin card-tick on top. ~150 ms, no tail.
 *   `playEviction(cue)`    the Execution. The sting under the verdict plate: a low drop, a
 *                          soft-attack "curtain" of lowpassed noise, and two detuned sines
 *                          holding underneath so the last half-second beats instead of sitting
 *                          on a flat tone (the same trick `buildHunterVoice` uses, for the same
 *                          reason). ~520 ms.
 *
 * ⚠️ **DRY AND SMALL ON PURPOSE.** This plays on a television in a room of eight people
 * talking over it. Both voices sit well under `playMeleeImpact`'s headline level and neither has
 * a reverb tail — a sting that rings for two seconds is a sting the room talks through once and
 * then resents. Recap is ~10 s (CLAUDE.md); nothing here may outlast a beat.
 *
 * ⚠️ **PER-CALL NODES, NOT POOLED CHAINS — and that is a departure from this file's header.**
 * Every pooled voice above shares ONE filter+gain chain whose parameters are automated per
 * trigger, which is only safe while two triggers cannot overlap; `MELEE_FIELD_SLOTS` exists as
 * two slots precisely because the barrier contact and rebound DO overlap. Two phones can tap
 * NOMINATE in the same animation frame, so two `playNameLanded` calls can overlap by well
 * inside the 150 ms envelope, and a shared gain would have the second call's `setValueAtTime`
 * stamp on top of the first call's decay. `playFurnBreak` is the precedent for the cheap
 * correct answer: build per call, share only the noise BUFFER. These fire a handful of times a
 * night, not ninety times a run.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 🚨🚨 **THE AUDIO LEAK RULE.** This is a hidden-role game and sound is a broadcast channel
 * with no privacy model at all: the Glitched hears the television exactly as well as everyone
 * else, and nothing on a screenshot review can catch a leak that lives in a filter frequency.
 *
 * The two ways audio leaks are NOT content — they are TIMING and MAGNITUDE:
 *
 *   TIMING    a cue that fires before the fact it describes is on the screen pre-reveals it.
 *             A sting that landed the instant the server resolved the ballot, one paint before
 *             the verdict plate, tells the room the result early — and looks perfect in a
 *             screenshot, because by the time the shutter opens the plate is up too.
 *   MAGNITUDE a cue parameter that is a CONTINUOUS function of a game value is a data channel.
 *             A bed whose intensity tracked true vote alignment, or a sting whose pitch rode
 *             the real margin, would broadcast an internal to the whole room with nothing
 *             wrong on screen. This is the same defect class as `src/party/log.js:69` blocking
 *             `player.claim_set` from the TV: the host tab is not a nameplate, and neither is
 *             the host tab's loudspeaker.
 *
 * THE RULE, in three clauses, each of them mechanically checkable by `harness/party-audio.mjs`:
 *
 *   R1 CLOSED PAYLOAD.  A cue is a validated object whose keys are a closed allowlist of facts
 *                       already painted on that beat's HTML. `showCueViolations` is to audio
 *                       what `cueViolations` (`src/party/follow.js:534`) is to the follow
 *                       iframe, and `SHOW_CUE_FORBIDDEN` below is asserted by the gate to be a
 *                       SUPERSET of `FOLLOW_FORBIDDEN` — a secret that may not reach a
 *                       renderer must not reach a loudspeaker instead.
 *   R2 BEAT-BOUND.      A cue carries the beat it belongs to and is refused on any other. That
 *                       is the TIMING clause: `name` is legal only on `reckoning`, where the
 *                       nomination rows are painted, and `evict` only on `execution`, where the
 *                       verdict plate is.
 *   R3 FINITE VOICE.    `showCueVoice` maps a validated cue onto one of a FINITE, ENUMERABLE
 *                       set of parameter blocks — three for `name`, two for `evict`. That is
 *                       the MAGNITUDE clause, and it is deliberately stronger than "do not leak
 *                       the margin": there is no continuous parameter to ride at all. No pitch
 *                       to slide, no gain to swell, nothing for a room to read a number off.
 *                       The gate enumerates the whole legal cue space and asserts the voice
 *                       space stays at five; wire any game scalar into a parameter and that
 *                       count moves.
 *
 * The per-call jitter below is SALTED ON THE CALL COUNTER ALONE, never on a cue field, and the
 * gate reads this file's source to check it. Seeded "randomness" that took a cue value as its
 * salt would be a covert channel wearing R3's clothes: finite tables, secret dither.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The two Prime Time cue kinds. Anything else is refused, not ignored. */
export const SHOW_CUE_KINDS = ['name', 'evict'];

/**
 * R2 · the ONLY beat each cue may fire on — the beat whose HTML paints the fact it describes.
 * `src/views/party-host.js` paints the standing nominations on `reckoning` and the verdict
 * plate on `execution`; a cue naming any other beat is a pre-reveal even when every field on
 * it is legal.
 */
export const SHOW_CUE_BEAT = { name: 'reckoning', evict: 'execution' };

/**
 * R1 · the closed allowlist, per kind. Every entry is a fact the television is ALREADY showing
 * at that moment:
 *   `standing`  how many nomination rows the Reckoning board is printing (`talkStage`'s
 *               `standing:`). A count, never an identity — the same shape `readyState()` uses
 *               and the same reason (`party-warm` W37a: the band carries a number, not a name).
 *   `executed`  whether the Execution painted a nameplate or the word NOBODY. A BOOLEAN, not
 *               the id: who it was is on the screen in letters a foot high and does not need to
 *               reach the synthesiser to get there.
 */
export const SHOW_CUE_KEYS = {
  name: ['kind', 'beat', 'standing'],
  evict: ['kind', 'beat', 'executed'],
};

/**
 * 🚨 A DELIBERATE COPY OF `FOLLOW_FORBIDDEN` PLUS THE THINGS ONLY A SOUND COULD CARRY, AND THE
 * COPY IS THE POINT TWICE OVER.
 *
 * Once for structure: this module has ZERO imports and has to keep them — it is the survival
 * game's audio as well as the show's, and importing `src/party/follow.js` here would drag the
 * night loop into `game.play`'s bundle to borrow one array. Same argument as `seedRand`'s own
 * note at the top of this file. `harness/party-audio.mjs` imports BOTH and asserts this list is
 * a superset, exactly as `party-follow` F5 asserts `FOLLOW_FORBIDDEN ⊇ FANOUT_FORBIDDEN`.
 *
 * Once for coverage: the tail entries are audio-specific and have no meaning on the follow URL.
 * `margin`, `tally`, `votes`, `threat`, `suspicion` and `alignment01` are the SCALARS — the
 * shapes a magnitude leak actually arrives in. A reviewer adding "just a little intensity" to
 * the sting reaches for one of these names, and the gate's control arm is built out of them.
 */
export const SHOW_CUE_FORBIDDEN = [
  // --- verbatim from FOLLOW_FORBIDDEN (asserted by harness/party-audio.mjs A1) ---
  'role', 'alignment', 'cover', 'claim', 'castSeed', 'you', 'teammates',
  'flyover', 'hunter', 'deal',
  'marks', 'lid', 'plan',
  // --- the scalars. A magnitude leak has to ride one of these, or a name like them. ---
  'margin', 'tally', 'votes', 'lynchVotes', 'threat', 'suspicion', 'alignment01', 'seed',
];

/**
 * R3 · the finite voice tables. Three name-landings and two evictions, and there is no fourth
 * or third — `showCueVoice` indexes these, it never interpolates between them.
 *
 * The three name steps climb as the board fills: each successive name lands a little higher and
 * a little tighter, which is the Reckoning getting busier said in sound. `standing` is CLAMPED
 * to the table length, so a nine-nominee board sounds like a three-nominee one — a count that
 * kept climbing would be a continuous parameter with extra steps, which is exactly what R3 is
 * for.
 */
const NAME_VOICES = [
  { slapF: 2000, slapQ: 2.0, slapG: 0.30, bodyF0: 196, bodyF1: 118, bodyG: 0.26, tickF: 4600, tickG: 0.10, dur: 0.075 },
  { slapF: 2260, slapQ: 2.4, slapG: 0.32, bodyF0: 233, bodyF1: 140, bodyG: 0.25, tickF: 5200, tickG: 0.11, dur: 0.068 },
  { slapF: 2520, slapQ: 2.8, slapG: 0.34, bodyF0: 277, bodyF1: 166, bodyG: 0.24, tickF: 5800, tickG: 0.12, dur: 0.062 },
];

/**
 * The two evictions. `[1]` is somebody going out: a real low drop under the plate. `[0]` is
 * NOBODY, and it is NOT a quieter version of the same sting — it has no drop at all, a softer
 * and longer curtain, and a lower hold, so it reads as *nothing happened* rather than as a
 * smaller eviction. A "no eviction" that sounded like a weak eviction would be the audio
 * version of the defect `executionSwing` was written to kill: one fact, said wrong.
 */
const EVICT_VOICES = [
  { dropF0: 0, dropF1: 0, dropG: 0.00, dropDur: 0.00, curtainF: 760, curtainG: 0.14, curtainDur: 0.26, holdF: 262, holdDetune: 4.5, holdG: 0.055, holdDur: 0.62 },
  { dropF0: 92, dropF1: 42, dropG: 0.34, dropDur: 0.22, curtainF: 900, curtainG: 0.24, curtainDur: 0.18, holdF: 330, holdDetune: 6.5, holdG: 0.085, holdDur: 0.52 },
];

/** How many distinct name-landings exist. Exported so the gate asserts the voice space, not a
 *  magic number it copied. */
export const NAME_STEPS = NAME_VOICES.length;
/** Same, for the eviction. Two: out, and nobody. */
export const EVICT_STEPS = EVICT_VOICES.length;

/**
 * R1+R2 · empty means the cue holds. Same contract and same shape as
 * `src/party/follow.js`'s `cueViolations`: used as an assertion by `harness/party-audio.mjs`
 * and as a refusal by both `playNameLanded` and `playEviction`.
 *
 * Missing fields fail through the type checks rather than needing their own clause — a `name`
 * cue with no `standing` is "not a count", which is the message a caller needs anyway.
 */
export function showCueViolations(cue) {
  if (!cue || typeof cue !== 'object') return ['<empty>'];
  const kind = cue.kind;
  if (!SHOW_CUE_KINDS.includes(kind)) return [`cue.kind=${String(kind)}`];
  const bad = [];
  const allowed = SHOW_CUE_KEYS[kind];
  for (const k of Object.keys(cue)) {
    if (SHOW_CUE_FORBIDDEN.includes(k)) bad.push(`cue.${kind}.${k}:forbidden`);
    else if (!allowed.includes(k)) bad.push(`cue.${kind}.${k}:unknown`);
  }
  // R2 — the beat clause. Legal fields on the wrong beat is still a pre-reveal.
  if (cue.beat !== SHOW_CUE_BEAT[kind]) bad.push(`cue.${kind}.beat=${String(cue.beat)}`);
  if (kind === 'name' && !(Number.isInteger(cue.standing) && cue.standing >= 0)) {
    bad.push('cue.name.standing:<not a count>');
  }
  if (kind === 'evict' && typeof cue.executed !== 'boolean') {
    bad.push('cue.evict.executed:<not a boolean>');
  }
  return bad;
}

/**
 * R3 · a validated cue -> exactly one of the five parameter blocks, or null if it is not a
 * legal cue. PURE: no `ctx`, no clock, no module state beyond the two frozen tables, so the
 * gate can enumerate the entire legal cue space in node and count the distinct outputs.
 *
 * `step` rides along so the gate can see WHICH block was chosen without matching floats.
 */
export function showCueVoice(cue) {
  if (showCueViolations(cue).length) return null;
  if (cue.kind === 'name') {
    const step = Math.min(NAME_VOICES.length - 1, cue.standing);
    return { kind: 'name', step, ...NAME_VOICES[step] };
  }
  const step = cue.executed ? 1 : 0;
  return { kind: 'evict', step, ...EVICT_VOICES[step] };
}

/**
 * A refused cue is SILENT, and silence is the correct outcome — the leak is the bug, not the
 * missing sound. It still says so once in the console, because a developer who mis-wired a cue
 * otherwise gets no sound and no clue.
 *
 * ⚠️ **KEY NAMES ONLY, NEVER VALUES.** `showCueViolations` builds its strings out of key names
 * and a beat, and nothing here adds an operand. Printing the offending VALUE into the host
 * tab's console would recreate `log.js:69`'s bug — DevTools on the TV reading a secret — while
 * looking like diagnostics.
 */
function refuseShowCue(kind, bad) {
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(`[audio] show cue refused (${kind}): ${bad.join(', ')}`);
  }
  return false;
}

let _showHit = 0;    // increments per playNameLanded — the ONLY jitter salt this voice has
let _evictHit = 0;   // ditto, playEviction

/**
 * 🎬 THE RECKONING — a name lands on the board.
 *
 * Dry gavel-ish block tap, under ~170 ms end to end: bandpassed noise slap (the card hitting
 * the board), a triangle body falling about a fifth (the board itself), a bright tick on top
 * (the edge of the card). Nothing rings.
 *
 * `cue` must be `{ kind:'name', beat:'reckoning', standing:<int> }`. Returns true if it played.
 */
export function playNameLanded(cue) {
  if (cue?.kind !== 'name') return refuseShowCue('name', [`cue.kind=${String(cue?.kind)}`]);
  const bad = showCueViolations(cue);
  if (bad.length) return refuseShowCue('name', bad);
  if (!ctx || !master || renderLocked() || !noiseBuffer) return false;
  const v = showCueVoice(cue);

  _showHit++;
  // 🚨 SALTED ON THE CALL COUNTER ONLY — never on a cue field. See the leak rule, clause R3's
  // closing note; `harness/party-audio.mjs` A6 reads this file's source to keep it that way.
  const salt = _showHit;
  const jf = 1 + (seedRand(_audioSeed, `nlf|${salt}`) - 0.5) * 0.10;
  const jg = 1 + (seedRand(_audioSeed, `nlg|${salt}`) - 0.5) * 0.16;
  const t0 = ctx.currentTime + seedRand(_audioSeed, `nlt|${salt}`) * 0.006;

  // 1 · the slap — bandpassed noise, the card meeting the board
  {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = v.slapF * jf;
    f.Q.value = v.slapQ;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v.slapG * jg), t0 + 0.0007);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + v.dur + 0.03);
  }
  // 2 · the body — a wooden block, falling about a fifth. This is the pitch the room hears.
  {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(v.bodyF0 * jf, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, v.bodyF1 * jf), t0 + v.dur * 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v.bodyG * jg), t0 + 0.0012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur * 2.2);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + v.dur * 2.4);
  }
  // 3 · the tick — the top edge. Quiet; it is what makes the tap read as an OBJECT landing
  // rather than as a drum, at the distance a television actually is from the sofa.
  {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = v.tickF;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v.tickG * jg), t0 + 0.0046);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.018);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0 + 0.004); src.stop(t0 + 0.04);
  }
  return true;
}

/**
 * 🎬 THE EXECUTION — the sting under the verdict plate.
 *
 * Three layers, ~520 ms and no tail past that: a low sine DROP (only when somebody is actually
 * out), a soft-attack CURTAIN of lowpassed noise, and a HOLD of two sines a few Hz apart so the
 * last half-second beats slowly instead of sitting on a flat tone — `buildHunterVoice`'s
 * detuned-partner trick, borrowed for the same reason it exists there: a held tone with no
 * movement in it reads as a fault in the television.
 *
 * `cue` must be `{ kind:'evict', beat:'execution', executed:<bool> }`. Returns true if it
 * played. The BOOLEAN is the whole payload — see `SHOW_CUE_KEYS`.
 */
export function playEviction(cue) {
  if (cue?.kind !== 'evict') return refuseShowCue('evict', [`cue.kind=${String(cue?.kind)}`]);
  const bad = showCueViolations(cue);
  if (bad.length) return refuseShowCue('evict', bad);
  if (!ctx || !master || renderLocked() || !noiseBuffer) return false;
  const v = showCueVoice(cue);

  _evictHit++;
  // 🚨 CALL COUNTER ONLY, exactly as in `playNameLanded`. Gate A6.
  const salt = _evictHit;
  const jf = 1 + (seedRand(_audioSeed, `evf|${salt}`) - 0.5) * 0.05;
  const jg = 1 + (seedRand(_audioSeed, `evg|${salt}`) - 0.5) * 0.10;
  const t0 = ctx.currentTime + seedRand(_audioSeed, `evt|${salt}`) * 0.008;

  // 1 · the drop — the floor going out from under the name. Absent entirely on NOBODY.
  if (v.dropG > 0) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(v.dropF0 * jf, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, v.dropF1 * jf), t0 + v.dropDur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v.dropG * jg), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dropDur + 0.06);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + v.dropDur + 0.1);
  }
  // 2 · the curtain — lowpassed noise with an 18 ms attack. Soft on purpose: a hard transient
  // here would be a gunshot, and this file already has one of those with a different meaning.
  {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = v.curtainF;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v.curtainG * jg), t0 + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.curtainDur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + v.curtainDur + 0.05);
  }
  // 3 · the hold — two sines `holdDetune` Hz apart. The beat frequency is the difference, so
  // ~5-7 Hz: slow enough to hear as movement, fast enough to be gone before the beat is.
  {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v.holdG * jg), t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.holdDur);
    g.connect(master);
    for (const df of [0, v.holdDetune]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = v.holdF * jf + df;
      o.connect(g);
      o.start(t0); o.stop(t0 + v.holdDur + 0.05);
    }
  }
  return true;
}

if (typeof window !== 'undefined') {
  window.__rrrAudio = {
    _renderOffline,
    hasCtx: () => !!ctx,
    ctxState: () => ctx?.state ?? null,
    playGunshot,
    playWallStage,
    setHunterThreat,
    playMeleeImpact,
    playDoorBang,
    playFurnBreak,
    /* 📺 Prime Time. `showCueViolations` is exposed for the same reason `follow.js` exports
     * `cueViolations`: a leak rule nobody can query from the page is a promise, not a gate. */
    playNameLanded,
    playEviction,
    showCueViolations,
    showCueVoice,
    seedAudioVariation,
    /** render-harness only — see `setBarrierVoice`. The game never calls this. */
    setBarrierVoice,
    /** max |sample| currently sitting in the analyser's time-domain buffer, i.e. real
     * rendered output — not a parameter value, an actual measured amplitude. */
    peak: () => {
      if (!analyser) return 0;
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      let m = 0;
      for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
      return m;
    },
  };
}
