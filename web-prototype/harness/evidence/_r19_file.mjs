// Critic scratch: file the round-19 hunter.2 verdict without fighting shell quoting.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const summary = [
  'Real progress on the two biggest round-18 hates: the limbs now carry mechanism and the hands are real claws.',
  'But the surface story is unchanged in the dimension that mattered. uSootDark made the grime BLACKER, not WARMER:',
  'render dirt measures sat 0.6-6.6% at hue 0-221 (neutral to cool) where the art measures sat 35-53% at hue 24-33',
  '(warm brown), and darkening a neutral makes it read MORE like lichen, not less. The face is still a black rectangle',
  'with two red stickers.',
  'WARNING - THE BENCH IS LYING. harness/hunter-critique.mjs calls measure.mjs with the default band 0.12,0.90 on BOTH',
  'images, and BOTH figures overflow it. Render height reads 841 = exactly 0.78 x 1080; art reads 276 = exactly',
  '0.78 x 354. True heights are 920 and 333, found by band sweep. So every reference number on',
  'progress/critique/index.html is inflated ~20% and every H-fraction is taken from a false origin. That is the',
  'ROUND 32 failure measure.mjs documents in its own header, reintroduced because the bench never passes --refband.',
  'Round 18 trusted it and filed TRUNK PROPORTION HOLDS UP as a win off it; corrected, the waist is +29.7%.',
  'This also settles the round-17-vs-18 shoulder fight: the art shoulder-peak LOCATION is band-unstable (0.728 or',
  '0.840) and this instrument cannot resolve it, so stop arguing about it. What IS stable across three render splits',
  'x two art widths x corrected bands is that the render is -51.6% at 0.845 H and +62.9% at 0.950 H - the head is too',
  'big and sits ON TOP of bare shoulders, where the art buries a smaller head down between the socket rim and the',
  'pauldron.',
].join(' ');

const hates = [
  'DIRT IS GREY, THE ART IS BROWN - THE DARKENING WENT ALONG THE WRONG AXIS. Darkest 15% of pixels, render: thigh ' +
  'rgb(74,74,74) sat 0.6%, boot rgb(59,58,57) sat 3.8%, head rgb(64,65,69) hue 221 sat 6.6% - neutral to faintly ' +
  'BLUE. Art in the same places: thigh rgb(55,44,36) sat 35.2%, boot rgb(28,23,16) sat 43.7%, torso rgb(35,24,17) ' +
  'sat 52.9%, all hue 24-33. The mid-tone shell tells the same story: render sat 1.6-6.5% everywhere against art ' +
  '7.2-18%. uSootDark raised contrast and left hue untouched, so this is now a grey robot with HIGHER-CONTRAST grey ' +
  'stains. The fix is warmth and a second contaminant layer, not more black: the art overlays a warm brown ON the ' +
  'shell, the render only darkens the shell it already has.',

  'GRIME HAS NO SOURCE AND NO GRAVITY - IT IS THE SAME EVERYWHERE. Light-to-dark contrast ratio by body part, ' +
  'render: head x3.13, thigh x3.01, boot x3.68 - a 22% spread, i.e. uniform head to toe. Art: head x2.06, thigh ' +
  'x5.29, torso x5.98, boot x9.90 - a 4.8x spread, cleanest at the crown and filthiest at the feet. Blob scale is ' +
  'also constant across head, chest, thigh and boot in the render. Nothing streaks DOWNWARD off a horizontal lip, ' +
  'nothing pools in a seam or under the neck collar, no rust blooms from a puncture. (Round 18 had this half ' +
  'backwards - it claimed the art leaves the LOWER LEGS comparatively clean. Measured, the art boots are the ' +
  'dirtiest thing on the figure at x9.90 and the HEAD is the cleanest at x2.06.)',

  'THE VISOR IS A HOLE AND THE EYES THROW NO LIGHT INTO IT. Render lower visor rgb(9,8,13), luma mean 8.7, hue 250 ' +
  '- dead black with a COOL cast. Same region of the art: rgb(75,47,46), luma 52.6, hue 3, sat 39% - six times ' +
  'brighter and warm, because in the art the eyes bounce red onto the plate. Render upper visor luma 31.9 hue 218 ' +
  'vs art 66.3 hue 14. The ring of visor immediately outboard of a render eye measures rgb(15,12,18) - literally ' +
  'zero red spill. And the lamps are the wrong shape: fat rounded teardrops roughly 2-3x the area of the thin ' +
  'canted slits in the art. The cant is right now; the size, the bloom and the plate are not. No specular roll on ' +
  'the brow, no dust on the glass, no lower bevel.',

  'WAIST +29.7% - THE TRUNK IS A SLAB, AND ROUND 18 CALLED THIS A WIN OFF A TRUNCATED TABLE. Corrected bands ' +
  '(render 0.06,0.96 giving height 920; art 0.01,0.965 giving 333), byte-identical across render splits ' +
  '0.34/0.36/0.38 and art widths 0.30/0.32: shoulder 0.653 vs art 0.586 (+11.6%), WAIST 0.627 vs 0.483 (+29.7%), ' +
  'hips 0.766 vs 0.712-0.739 (+3.7 to +7.7%). The render tapers 4% from shoulder to waist; the art tapers 17%. ' +
  'Take it out of the waist, not the shoulders.',

  'ARMS STILL WELDED TO THE RIBS FROM ARMPIT TO ELBOW - improved, not closed. Median arm-to-body daylight render ' +
  'L 0.013 R 0.024-0.030 H against art L 0.102 R 0.093, stable across all six crop combinations: three to eight ' +
  'times short. Read the cross-sections: at 0.545 H and 0.600 H the render silhouette is ONE unbroken mass 0.703 ' +
  'and 0.662 wide, while the art breaks into THREE masses separated by gaps of 0.063/0.054 and 0.135/0.120 H. The ' +
  'forearms swing clear low down, which is the visible improvement, but the upper arms are still fused to the ribs ' +
  'so the ape-hang wedge of air only opens below the elbow.',

  'THE MINT CAPS ARE THE ONLY CLEAN THING ON A BURNED MACHINE, AND THEY ARE IDENTICAL TWINS. Render cap contrast ' +
  'x3.22 and x2.82, and their darkest 15% is rgb(34,66,59) hue 166 sat 49% - that is SHADED MINT, not dirt. Art ' +
  'caps: x2.74 on one and x11.44 on the other, the second with darks at rgb(24,19,14) hue 30 sat 42.5%, i.e. warm ' +
  'soot laid ON TOP of the mint. Two things wrong: the render caps take no contaminant at all, and the render caps ' +
  'match each other while the art caps differ wildly - uniformity between a left and a right is itself a tell. ' +
  'They are also still single smooth ellipsoids where the art has faceted plates with panel breaks and two ' +
  'circular bolt heads.',

  'THE EMPTY SOCKET IS IN THE WRONG PLACE, NOT JUST AIMED WRONG. In the art it sits on the CROWN of the outboard ' +
  'shoulder, well clear of the head, its bore opening up and outboard so you read straight down a deep cylinder. ' +
  'In the render it sits inboard on the trapezius, overlapping the head silhouette, bore pointing at the camera - ' +
  'it reads as a growth on the chest beside the neck rather than as a limb torn off a shoulder. The cavity itself ' +
  'is genuinely good now (real interior wall, curved bore highlight) but it is still EMPTY: no severed cable ' +
  'stubs, no sheared bolts, no scorching radiating out of the mouth.',
];

const wins = [
  'ROUND-18 HATE 2 IS CLOSED - the limbs carry mechanism now. Both elbows have ribbed sleeves with an outboard ' +
  'disc, both knees have a recessed well with a visible linkage plate, and the ankles break. That hate was filed ' +
  'as the single biggest reason a stranger picks the art as real, and it no longer is.',

  'ROUND-18 HATE 3 IS HALF CLOSED ON THE HAND HALF - these are real claws, not mitts. Four segmented fingers plus ' +
  'an opposed thumb, knuckles readable, and they hold up at gameplay distance in the judging frame.',

  'EYE CANT AND CHEST WORDMARK ARE BOTH GENUINELY CLOSED, verified on a full-res crop rather than the review PNG. ' +
  'The eyes are canted inner-end-down into a scowl, and the 4Humanity mark is absent from the hunter - only the ' +
  'scale-reference player still carries it.',

  'THE MINT TINT DID NOT LEAK ONTO THE PLAYER. Measured in the SAME frame, hunter caps read hue 162-163 and player ' +
  'caps hue 170-190, so the hunter is measurably greener and the shared file is being tinted per-unit as claimed. ' +
  '(I could not verify the player is unchanged from its own previous value without a before-shot; what I can say ' +
  'is that the two are now separated.)',

  'Perf comfortably inside budget at pinned quality=medium: GPU 0.93 of 1.39ms, frame 1.5ms, cpu 1.23ms, 176 ' +
  'calls, 229k tris, BUDGET OK. Silhouette IoU 79.9%, up from 79.0. Scale and menace still land - at 2.6x the ' +
  'player the hunch reads predatory rather than as a big standing mech.',
];

const args = [
  path.join(ROOT, 'harness', 'status.mjs'), 'set', 'hunter.2',
  '--round', '19', '--verdict', 'WEAK', '--score', '70', '--owner', 'critic-h2-r19',
  '--clear-hates', '--summary', summary,
];
for (const h of hates) args.push('--hates', h);
for (const w of wins) args.push('--wins', w);

const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });
process.exit(r.status ?? 1);
