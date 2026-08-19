// critic-hsheet-r7: file the verdict via an args array so no shell quoting is involved.
import { spawnSync } from 'node:child_process';

const args = ['harness/status.mjs', 'set', 'hunter.sheet',
  '--round', '7', '--verdict', 'WEAK', '--score', '76',
  '--owner', 'critic-hsheet-r7', '--clear-hates',
  '--summary',
  'WEAK 76, up from 71. The ramp READS and that is this piece job: size x1.00/x1.28/x1.72/x2.70 monotonic, grime monotonic (whole-figure luma 142.2/127.7/112.6/87.3, no later stage cleaner than an earlier one), and the eye story is a genuine FOUR-step blue to AMBER to red to red verified at 1080p, with stage 1 keeping a vestigial MOUTH mark under hostile amber - a convincing midpoint. The round-6 recolour hate is HALF fixed: cleanest-shell-decile luma is 188/188/188 for player/S1/S2, so the white paint now survives under the dirt on both midstages. But STAGE 3 IS STILL KHAKI (cleanest-shell r-b +7.7 vs player -0.8; with weathering fully OFF it still carries 12.2 pct brown pixels at luma 90.4 against the player 0.0 pct at 142.2) and its four extra arms are a flat dark taupe reading as a different material. So the sheet is three white machines and one brown one. Dirt character is also still wrong: an even single-frequency soft-edged mottle where the art uses PLACED hard-edged near-black soot that leaves bright white shell between it.',

  '--hates',
  'STAGE 3 IS STILL A BROWN MACHINE WHILE THE OTHER THREE ARE WHITE ONES - the round-6 headline hate is HALF fixed, and the unfixed half is the payoff figure. Cleanest-shell-decile (least-sooted paint) r-b measures -0.8 / +3.3 / +7.6 / +7.7 for player/S1/S2/S3, and cleanest-shell luma 188/188/188/178. So S1 and S2 now hold the white paint - the fix WORKED there - while stage 3 reads visibly khaki-olive, most obvious on the crown of its head against stage 2 neutral-grey crown. With the grime layer switched fully OFF, stage 3 still carries 12.2 pct brown pixels at luma 90.4 against the player 0.0 pct at 142.2. The bar art keeps BASELINE, STAGE 2 and STAGE 3 all on ONE white shell. FIX: finish the stage-3 whitening that was tried and reverted, and pay for the lost ramp gap with SOOT DENSITY AND BLACKNESS, not base tint.',

  '--hates',
  'STAGE 3 FOUR EXTRA ARMS ARE A DIFFERENT MATERIAL FROM ITS OWN TORSO - flat dark taupe, no white shell anywhere along them, no panel breakup, almost no value range. Beside them the torso still reads as painted shell, so the figure looks like rubber or leather limbs bolted onto a robot. In the art the extra arms are the SAME white/silver shell as the body, dirtied. This is the largest silhouette-level tell on the sheet and it lands on the biggest object in frame.',

  '--hates',
  'THE DIRT IS ONE FREQUENCY AND HAS NO EDGES. It is a soft airbrushed mottle at a single blob size, spread at near-equal density over every panel - torso, thighs, shins all alike - so there is no focal point and almost no clean shell is left on S2/S3. The art soot is near-BLACK, hard and ragged edged, and PLACED: it streaks DOWN from the neck and shoulder seams, pools in recesses, burns around the collar, and leaves large areas of bright white shell between. The art also carries a second finer grit/scratch frequency the render has none of. Gravity shows here only at whole-body scale (shins dirtier than mid-torso); at panel scale the mottle is directionless.',

  '--hates',
  'THE MINT CAPS STILL NEVER GET DIRTY - they are the one surface that becomes MORE conspicuous as the machine dies. Within-figure ratio of mint luma to that same figure shell median luma is 1.12 / 1.22 / 1.67 / 2.78 for player/S1/S2/S3, so by stage 3 the caps are nearly 3x the brightness of the shell around them, and stage-3 mint median luma 157.3 is actually HIGHER than the clean player 154.2. The round-6 complaint that the caps are identical on all four has been answered with a hue TINT (pushed greener and darker) - which is the same recolour-instead-of-dirty mistake relocated from the shell to the caps. The art dirties, greys and smudges them by STAGE 2.',

  '--hates',
  'POSTURE PEAKS AT STAGE 2 AND THEN REVERSES. Stage 2 genuinely hunches - head down and forward with shoulder mass rising beside it, close to the art stage-2 side views - so the round-6 claim that posture is FLAT does NOT reproduce. But stage 3 stands with a vertical torso, chest out, head high and clear above the shoulders, as upright as stage 1: head clearance across the three hunter stages measures 0.256 / 0.190 / 0.253 H. The final and biggest step UN-hunches, so it reads proud and heroic where the art stage 3 is deeply crouched with both heads sunk between raised shoulders. (The player figure from this detector is unreliable - its narrow torso defeats the shoulder-finder - so only the three hunter stages, which share a body plan, are compared.)',

  '--hates',
  'STAGE 3 CENTRE IS TWO CLEAN BRIGHT OBJECTS ON THE DIRTIEST FIGURE. The captured-body chest panel renders as a tidy bright WHITE vest with neat straps and buckles, and the rider head beside it is clean white with BLUE eyes; together they are the brightest, cleanest things in the frame and they sit dead centre on the most corroded machine. The art stage 3 has a RUPTURED chest spilling dark cabling and tubes down the centreline - the horror of that design is that the body is torn open, not that it is wearing a harness. (Twin-head COUNT is inherited and ruled per the hero pose, logged not weighted - but the rider reading clean and blue-eyed is a separate readability problem.)',

  '--wins',
  'THE RAMP READS - this piece reason to exist, and it PASSES. Heights 245/313/421/661 px = x1.000/x1.278/x1.718/x2.698 against nominal 1.00/1.35/1.90/2.60, monotonic with each step larger than the last. Grime is MONOTONIC figure to figure with no reversal anywhere: whole-figure luma 142.2/127.7/112.6/87.3, darkFrac 0.56/0.65/0.69/0.79, brown 0.0/0.6/3.6/13.0 pct. Nobody would call these four unrelated models - shared feet, knee discs, hand design and head form carry the family across a 2.7x size range on one ground line.',

  '--wins',
  'THE SHELL FIX GENUINELY WORKED ON STAGES 1 AND 2 - real movement on the round-6 headline hate, and it must NOT be reverted while stage 3 is being finished. Cleanest-shell-decile luma is 188/188/188 for player/S1/S2, so the white paint is intact UNDER the dirt on both midstages; at matched height S2 now reads as a white machine with dark smudging rather than a khaki one. Only stage 3 still fails the test.',

  '--wins',
  'THE EYE STORY IS A GENUINE FOUR-STEP, VERIFIED AT FULL RES: player soft blue face-screen with a SMILE, stage 1 AMBER eyes rgb(183,108,83) that RETAIN A SMALL VESTIGIAL MOUTH MARK, stage 2 red wedges, stage 3 vivid red rgb(221,46,36). Stage 1 keeping a ghost of the friendly face under hostile amber is the best single idea on the sheet, and it is what makes stage 1 a convincing MIDPOINT rather than a dusty player. WARNING FOR FUTURE CRITICS, CONFIRMED AGAIN THIS ROUND: at --review 1280 the stage-1 amber resamples to RED and the ramp collapses into a blue/red binary. Judge eyes ONLY on the 1080p or a crop of it.',

  '--wins',
  'THE SCALE-REFERENCE PLAYER IS NOW A CLEAN CONTROL: weather A/B moves only 0.14 pct of its body pixels, against the ~6.9 pct future critics were warned to expect, so it is now a trustworthy exposure and colour baseline for the other three. Remaining weather deltas are 19.7 / 33.4 / 26.1 pct for S1/S2/S3 - note that is NON-monotonic, the removable grime layer RECEDES at stage 3 because stage 3 dirt is increasingly baked into base albedo instead of layered on top.',

  '--wins',
  'PERF IS INSIDE BUDGET AND THE BUSTS-THE-ROOM-BUDGET LINE REMAINS STALE - re-measured, not inherited: GPU 1.11-1.20 of 1.39 ms at pinned quality=medium, 410 of 625 calls, 567k of 900k tris. Only CPU sits marginally over at 2.2-2.8 of 2.0 ms on a noisy box. HARNESS TRAP THAT COST ME TWO WRONG READINGS: my first two runs reported GPU 1.96 and 1.74 with CPU swinging 4.47 then 22.84 ms at IDENTICAL fps - nine ORPHANED chrome-headless-shell processes were contending for the GPU. Killing them took fps from 195 to 390 and GPU to 1.11. Kill stray headless shells before quoting any perf number on this project.',

  '--wins',
  'TOOLING NOTES FOR ROUND 8. measure.mjs still reports 2 figures for this 4-figure view - do not use it here; harness/_tmp_hsheet_seg.mjs (gradient-flood) recovers all four cleanly. shoot.mjs --extra takes only the FIRST occurrence, so passing weather=0 as a SECOND --extra is silently ignored and produces a byte-identical PNG - join them into one string with an ampersand or your weather A/B is a no-op (I caught this by hashing the two captures). Left behind: harness/_tmp_r7_matched.mjs (rescales all four figures to one height - the single most useful image for this piece, it strips size out so colour and dirt compare directly), _tmp_r7_palette.mjs (per-figure mint/shell/eye colour split) and _tmp_r7_ab.mjs (art-vs-render matched-height A/B).',
];

const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
