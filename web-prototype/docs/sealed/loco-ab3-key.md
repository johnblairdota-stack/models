# SEALED — blind A/B key for progress/shots/loco-ab3/

⛔ **CRITICS MUST NOT OPEN THIS FILE.** It exists so the session lead can decode a blind
judgement AFTER it has been filed. Opening it before judging destroys the only independent
signal the project has. If you are a critic and you are reading this line, stop, and say so
in your report.

Round 3 sheets (`progress/shots/loco-ab3/`), assignment deliberately mixed and deliberately
different from round 2's on walk and run:

| gait | variant A | variant B |
|---|---|---|
| walk | plant OFF | plant **ON** |
| run  | plant **ON** | plant OFF |
| limp | plant OFF | plant **ON** |

Verified genuinely different before sealing (`harness/_tmp_critic_diff.mjs`), because round 1's
limp pair was two copies of the same build and its "0.137% indistinguishable" was measuring
nothing:

| gait | differing pixels | sumAbsDiff |
|---|---|---|
| walk | 7.47% | 18.8 M |
| run | 8.45% | 22.8 M |
| limp | 3.36% | 9.9 M |

⚠ **Read those against the instrument's own noise floor, which was measured this round for the
first time and is larger than anyone assumed.** Two shoots of the SAME strobe config, nothing
changed between them, differ in **4.71% of pixels (sumAbsDiff 1.3 M, maxDiff 315)**. Shot with
`--extra "ao=0"` the identical repeat is byte-for-byte identical — 0 pixels — so all of it is
`AO_FRAG`'s per-frame dither (`uFrame`) landing on a different settle count. So:

- a pixel PERCENTAGE cannot separate these pairs and never could; limp's 3.36% is *below* the
  floor's 4.71% by count while being 7.6× above it by magnitude;
- the pairs are separated by sumAbsDiff (7.6× to 17.5× the floor), i.e. by structural change;
- round 1's 0.137% sat **34× below** the floor, which is independent proof that pair could not
  have been two different builds — as it turned out, it was not.

## What changed between round 2's sheets and these

**LIMP's gait changed and nothing else's did.** `PLANT.toeOff.limp` 0.70 → 0.38 and
`PLANT.heelOff` became per-gait (walk/run 0.70 unchanged, limp 0.82). Walk and run are
bit-identical across the change — `footskate.mjs --converge --plant` reproduces walk
576/1407/1964/2055 and run 1030/3288/7609/9079 either side of it.

**The STAGING changed for all three**, and the lead should weigh this when decoding: every
board now carries a mid-grey floor pad with a horizon line at the soles (`groundPad()` in
`src/views/char-locomotion.js`), where rounds 1 and 2 were shot against a seamless white cyc
with no ground drawn at all. Both sides of every pair get identical staging, so the pairs are
still a fair within-pair test, but a cross-round comparison of *how confidently* a critic calls
walk is not like-for-like.

⚠ **One consequence is worth naming before the decode, because it cuts in the plant's favour
and it was not designed to.** The plant-OFF gait puts the foot through the floor — measured
on limp, the toe runs −65 to −90 mm for most of the cycle, and the source has long recorded a
34 mm penetration at mid-stance in walk. Against a white void that was invisible. Against a
drawn floor it is visible. So if a round-3 critic prefers plant-ON more strongly than round 2's
did, part of that may be the floor exposing a defect the plant already fixed, rather than any
new merit in the roll. That is a true thing about the two gaits, not a rigged comparison — but
it is a change in what the instrument can see, and the decode should say so.

## Round 2's key, and its result (for the lead only)

Round 2 (`progress/shots/loco-ab2/`): walk A=**ON**/B=OFF · run A=OFF/B=**ON** ·
limp A=OFF/B=**ON**. Decoded: walk plant-ON **won** (65%), run indistinguishable (55%),
limp plant-ON **lost** — the critic described the planted limp as "a dramatic ballet-style
toe-point ... an exaggerated/hyperextended ankle bend rather than a believable weight-bearing
plant". That is the defect round 3 set out to fix, and the fix is measurable: the foot's
ground angle at the frame the strobe freezes (phase 0.667) goes **33.4° → 11.7°**, heel
113 mm → 40 mm, sole still in contact at 2 mm.
