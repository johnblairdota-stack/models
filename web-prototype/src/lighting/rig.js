import * as THREE from 'three';

/**
 * THE DARK RIG
 *
 * The whole estate is lit on the Alien: Isolation principle, which is not "make it dim".
 * An evenly dim room reads as unfinished. A frightening room is one where a small part of
 * the frame is genuinely bright — often blown out — and the rest falls to 2% of that, with
 * enough colour separation between the source and the ambient that your eye can still
 * resolve shape in the dark.
 *
 * So every room here is built from exactly four ingredients:
 *
 *   1  ONE shadow-casting light. 1024², frustum cropped to the part of the room that
 *      actually needs contact shadows. Never two unless a piece is specifically about two.
 *   2  PRACTICALS — emissive geometry with a short-range non-shadowing point light each.
 *      See lighting/practicals.js.
 *   3  IBL — a per-room PMREM built from coloured boxes. This is what carries the "unlit
 *      side is still readable" requirement in quality-bar item 7. A black cut-out
 *      silhouette is a failure, and the IBL is the cheapest fix that is also the correct
 *      one: it is literally the room bouncing light onto the object.
 *   4  A BOUNCE PAIR — two very weak directional lights, warm from the source side and
 *      cold from the opposite side. Two extra lights with no shadow map cost almost
 *      nothing and they give the IBL some directionality so surfaces still have form.
 *
 * The colour split matters more than the levels. Warm source, cold shadow. In the Alien
 * frames the shadows are a desaturated blue-teal at 2–4% and the sources are amber at
 * 300%; that ratio is roughly seven stops and it is why the dark is legible instead of
 * muddy.
 */

const _envCache = new Map();

/**
 * A per-room PMREM environment. `boxes` are emissive slabs describing where the light in
 * this particular room comes from, in the room's own coordinates but at a reduced scale —
 * the PMREM only captures direction, so exact positions do not matter, relative
 * brightness and colour do.
 *
 * @param o.key      cache key
 * @param o.ambient  [r,g,b] the near-black the room sits in
 * @param o.boxes    [{size:[w,h,d], pos:[x,y,z], color:[r,g,b]}]
 */
export function roomEnv(renderer, o = {}) {
  const key = o.key ?? 'default';
  if (_envCache.has(key)) return _envCache.get(key);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const amb = o.ambient ?? [0.016, 0.020, 0.030];
  const shell = new THREE.Mesh(new THREE.BoxGeometry(24, 16, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(amb[0], amb[1], amb[2]), side: THREE.BackSide }));
  s.add(shell);

  for (const b of (o.boxes ?? [])) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...(b.size ?? [1, 1, 1])),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...(b.color ?? [1, 1, 1])) }));
    m.position.set(...(b.pos ?? [0, 0, 0]));
    s.add(m);
  }

  const tex = pmrem.fromScene(s, o.blur ?? 0.08).texture;
  pmrem.dispose();
  s.traverse((n) => { n.geometry?.dispose(); n.material?.dispose(); });
  _envCache.set(key, tex);
  return tex;
}

/**
 * Preset: a room with one tall cold window and a warm floor bounce from a hearth.
 *
 * ROUND 3 REBALANCE. The previous values put the ambient shell at 0.024 and everything but
 * the shaft fell off the bottom of the frame: walnut at 0.02 linear albedo times an
 * irradiance of 0.07 is 0.0015, which is black, and the capture proved it — the panelling,
 * the chimneypiece and the whole left half of the room were one flat void. The locked art
 * has *readable* panelling in shadow and a chimneypiece that is the second brightest thing
 * in the frame. So the shell goes up by 4x AND goes decisively cool-blue, because the only
 * thing that stops a lift like that turning the room into grey soup is that the lift is a
 * different colour from the source. Warm shaft, cold room.
 */
export function studyEnv(renderer) {
  return roomEnv(renderer, {
    key: 'study4',
    // ROUND 4 REBALANCE — measured, and it REVERSES the round-3 decision above.
    //
    // Round 3 made this shell decisively COOL on the argument that a warm key needs a cool
    // ambient or the frame turns to sepia. `harness/grade.mjs` now measures that argument
    // against the locked art and it does not survive: neither `1785319916301` nor
    // `1785320177684` contains a single cool cell of 144, and their DARK deciles are the
    // WARMEST part of the image ((r-b)/L 1.43 and 1.59 at the toe) while their brightest
    // decile is essentially colourless (0.093 and 0.109). The art is warm in shadow and
    // neutral in light — the exact opposite of what this preset was doing.
    //
    // That is physically what a dark walnut room lit through glass looks like: the direct
    // light is daylight, and every bounce it makes is off brown wood. So the shell is warm
    // and it is 1.6x brighter, because the other half of the diagnosis was that the render's
    // median pixel sat at L 9 against the art's 38 — 35% of the frame was literally zero.
    ambient: [0.176, 0.160, 0.138],
    boxes: [
      // The window. NEAR-NEUTRAL, and this is the single biggest correction in the file:
      // it used to be [5.20, 3.75, 1.90], a ratio of 2.7:1 red to blue, which is a sodium
      // lamp, not daylight. Daylight through pale quarry glass is white; the colour in the
      // art's window comes from the coloured BORDER of the glass, which is in the texture.
      { size: [2.6, 4.6, 0.3], pos: [-1.5, 4.0, -11.0], color: [5.40, 4.95, 4.20] },
      // its bounce off the polished Carrara, straight back up. A marble floor under a
      // window is a second light source and it is what makes the underside of the mantel
      // and the robot's chin readable. Doubled — the art's floor is the brightest surface
      // in the frame and a floor that bright bounces hard.
      { size: [9.0, 0.3, 9.0], pos: [-1.0, -6.0, -2.0], color: [1.050, 0.985, 0.855] },
      // hearth glow from the right — dialled well back, it was staining the whole frame
      { size: [0.3, 1.6, 2.6], pos: [8.5, -3.4, 1.0], color: [0.230, 0.120, 0.052] },
      // spill down the room's long axis: a mansion has more rooms in it. Was the one
      // deliberately COLD box (0.115/0.148/0.215) and it is what put blue in the left half
      // of every capture. Neutral now — the separation is chroma against value, not hue.
      { size: [0.3, 5.0, 6.0], pos: [-9.5, 0.5, 3.0], color: [0.205, 0.200, 0.196] },
      // the ceiling: the panelling absorbs most of it, but "most" is not "all", and at
      // 0.046 it was below the point where anything could reflect it.
      { size: [10, 0.3, 10], pos: [0, 7.6, 0], color: [0.098, 0.090, 0.078] },
    ],
  });
}

/** Preset: a double-height ballroom with a whole wall of windows. */
/**
 * Multiply an environment box's colour by a tint and put its LUMINANCE back where it was.
 *
 * A shell box is a light source, so a tint that is not renormalised is two changes — a hue and
 * an amount — arriving as one number, and this project has priced that pair as one thing twice
 * in as many rounds. Renormalising means a `dayTint` sweep can only ever move chroma, and the
 * median luminance is a control that must not move.
 */
function tintLuma(c, tint) {
  if (!tint) return c;
  const W = [0.2126, 0.7152, 0.0722];
  const t = [c[0] * tint[0], c[1] * tint[1], c[2] * tint[2]];
  const l0 = W[0] * c[0] + W[1] * c[1] + W[2] * c[2];
  const l1 = W[0] * t[0] + W[1] * t[1] + W[2] * t[2];
  const k = l1 > 1e-6 ? l0 / l1 : 1;
  return [t[0] * k, t[1] * k, t[2] * k];
}

export function ballroomEnv(renderer, o = {}) {
  const CG = o.candleGlow ?? 1.0;
  const AS = o.ambientScale ?? 1.0;
  const AT = o.ambientTint ?? [1, 1, 1];
  return roomEnv(renderer, {
    // ⚠ `key` CARRIES THE OPTIONS OR THE BAKER HANDS BACK THE WRONG SHELL. `roomEnv` caches by
    // key, and `prop.chandelier` shares this preset — so a ballroom-only variant that reused
    // 'ballroom2' would be served whichever of the two booted first. This is the same cache-key
    // trap `applyPlanarReflection` has a paragraph about.
    key: o.key ?? 'ballroom2',
    // ROUND 5 — the §6.2 rebalance the study got in round 3 and the other three rooms never
    // did. Effective ambient irradiance is this array times the view's
    // `scene.environmentIntensity`, and measured across the estate it was:
    //     room.study    0.176 x 4.6  = 0.81      (after the round-4 lift)
    //     room.ballroom 0.048 x 3.2  = 0.15      0.19x the study
    //     room.gallery  0.011 x 2.6  = 0.029     0.035x the study
    // which is the entire reason the ballroom measured median L 17.7 and the gallery 1.0. The
    // fix goes in the AMBIENT rather than the exposure, because exposure lifts the warm
    // highlights too and that is the number the chroma gate reads.
    //
    // It also goes decisively WARMER at the same time. The old shell was r/b 0.65 — a blue
    // ambient in a room whose light sources are candles — and prop.chandelier, which shares
    // this preset, spent three rounds with an amber top decile sitting on a blue floor.
    /**
     * ⚠ `ambient` IS THE ONLY TERM IN THIS SHELL THAT REACHES A SURFACE FACING NOWHERE, which
     * makes it the one that owns the very bottom of the ladder. The five boxes below are all
     * DIRECTIONAL — a surface has to face one to get any of it — so in the deepest shade, where
     * a fragment faces none of them, this is nearly all the light there is.
     *
     * Round 18's last open gap is deciles 2-3 with the RED MATCHING the bar and green and blue
     * both low, after the albedos, the fills, the sun, the toe, the haze and the drape have all
     * been corrected. A term that is slightly blue and lands hardest where nothing else lands
     * is the shape of that gap.
     *
     * `ambientScale` and `ambientTint` let the ballroom move it without touching
     * `prop.chandelier`, which shares this preset. Both default to no-ops.
     */
    ambient: [0.148 * AS * AT[0], 0.152 * AS * AT[1], 0.166 * AS * AT[2]],
    boxes: [
      /**
       * ⚠ **THE DAYLIGHT BOX IS THE BRIGHTEST THING IN THIS SHELL AND IT IS BLUE** (r/b 0.881).
       *
       * Round 44 located this room's remaining chroma defect by painting every cool-class pixel
       * at or above decile 9 (`_coolmask44`): it is not the windows and not the marble, it is
       * the HALO OF FLOOR AROUND EVERY SUN BAR. The bars themselves come out warm — the sun is
       * `0xffe4c0`, matched to the bar's own patch at r-b 44.9 against 45.3 — and every surface
       * the sun does NOT reach is lit by this box instead, and comes out blue. Ablated
       * (`_coldwho44 env-off`) the bright band lands on the reference: deciles 7-9 go
       * 0.24 / 0.24 / 0.10 to 0.33 / 0.35 / 0.17 against the bar's 0.34 / 0.33 / 0.34. It also
       * takes the median from 49.3 to 29.6, so the shell cannot simply go — this is the room's
       * fill as well as its cold.
       *
       * `dayTint` is a HUE knob and it holds luminance constant on purpose. The haze sweep in
       * the same round set `haze` to the game's 0.042 instead of this room's 0.026 and priced a
       * 62% amount change as a hue change; the control row moved the median 49.3 -> 40.7 before
       * anyone noticed. A tint that renormalises cannot do that.
       *
       * ⚠ Default [1, 1, 1], so `prop.chandelier` — which shares this preset — is byte-identical.
       */
      { size: [0.3, 7.0, 16.0], pos: [-11.5, 3.0, 0.0], color: tintLuma([2.60, 2.72, 2.95], o.dayTint) },   // window wall, daylight
      /**
       * ⚠ THE FLOOR BOUNCE, AND ROUND 17 FOUND IT IS WHY THE PROPS ARE WARM. This box is the
       * dominant term in everything this room's shade sees — the comment below is right that a
       * floor under a wall of windows is what lights the walls — and at r/b 1.106 it is warm.
       * That was correct when it was written (the floor was a marble chequer under daylight and
       * then an oak field), and it is the reason the dust sheets kept coming back at chroma 10.9
       * in shade against the bar's own sheets at 1.7: three albedo passes fought a bounce colour
       * rather than the sheets.
       *
       * `bounceTint` lets THE BALLROOM cool it without touching `prop.chandelier`, which shares
       * this preset and whose whole subject is a warm fixture. Default is the value that was
       * here, so that piece is byte-identical.
       */
      { size: [14.0, 0.3, 14.0], pos: [0, -7.0, 0], color: o.bounceTint ?? [1.150, 1.120, 1.040] },     // marble bounce — a chequer floor under a wall of windows is the brightest surface in the room and it is what lights the walls
      { size: [10.0, 0.3, 10.0], pos: [2, 7.4, 0], color: [0.200, 0.186, 0.164] },      // ceiling catch
      /**
       * ⚠ THE TWO WARMEST BOXES IN THE SHELL, AND THE BALLROOM CAN TURN THEM DOWN.
       *
       * These model candle glow off a lit chandelier cluster, at r/b 2.1 and 2.06 — by some way
       * the most chromatic thing in this environment — and they sit at EYE HEIGHT at both ends
       * of the room, which is exactly where the deep shade this shell describes lands. That is
       * correct for `prop.chandelier`, whose whole subject is a lit fixture. It is not correct
       * for a daylit ballroom whose chandeliers are hanging unlit under dust sheets.
       *
       * Round 18 matched this room's ladder to the bar through deciles 5-8 and could not close
       * deciles 3-4: 0.79 / 0.62 against 0.38 / 0.40, i.e. the deep shade still around 1.8x too
       * warm after the albedos, the fills and the sun had all been corrected. These are what is
       * left that is both warm and low.
       *
       * `candleGlow` scales them for callers that want to say so; default 1.0 keeps
       * `prop.chandelier` byte-identical.
       */
      { size: [3.0, 3.0, 0.3], pos: [4.0, 1.0, -11.0],
        color: [0.44 * CG, 0.34 * CG, 0.21 * CG] },
      { size: [3.0, 3.0, 0.3], pos: [-2.0, 1.0, 11.0],
        color: [0.36 * CG, 0.28 * CG, 0.175 * CG] },
    ],
  });
}

/** Preset: a long gallery lit only by sconces and picture lights. */
export function galleryEnv(renderer) {
  return roomEnv(renderer, {
    key: 'gallery2',
    // ROUND 5. This was the worst number on the board and it was pure arithmetic: at 0.011 x
    // 2.6 the gallery ran at ONE THIRTIETH of the study's effective ambient, which put 76.8%
    // of its pixels at L <= 2.6 and its median pixel at L 1.0 out of 255. It was not badly
    // lit; it was two orders of magnitude below the level at which anything in it could be
    // seen at all, and every other complaint about the piece was unmeasurable underneath that.
    // 13x, and warm, because a gallery lit by sconces is warm.
    // ROUND 6. The ambient is now NEUTRAL and the sconce boxes have most of their chroma
    // taken out. Round 5 fixed the gallery's brightness (median L 1.0 -> 11.9) and left the
    // colour untouched, so the piece went from an unmeasurable black corridor to a fully
    // measurable one whose EVERY decile read (r-b)/L between 1.26 and 2.4 — the flat
    // monochrome amber failure, top to bottom. An IBL shell is what lights every surface out
    // of a practical's reach, i.e. most of the room, so a warm shell tints the whole frame at
    // once. The warmth that belongs here is in the carpet bounce, which is a real red carpet.
    ambient: [0.178, 0.174, 0.170],
    boxes: [
      { size: [0.3, 2.0, 12.0], pos: [-6.5, 0.6, 0], color: [1.16, 1.02, 0.80] },       // sconce line, warm
      { size: [0.3, 2.0, 12.0], pos: [6.5, 0.6, 0], color: [1.01, 0.89, 0.70] },
      { size: [6.0, 0.3, 12.0], pos: [0, -6.4, 0], color: [0.240, 0.150, 0.120] },      // carpet bounce, red
      { size: [3.0, 5.0, 0.3], pos: [0, 2.0, -11.5], color: [2.30, 2.42, 2.72] },       // cold light at the far end
      { size: [8.0, 0.3, 12.0], pos: [0, 7.0, 0], color: [0.086, 0.080, 0.074] },
    ],
  });
}

/** Preset: the near-black of light.dark. One amber source, everything else blue. */
export function darkEnv(renderer) {
  return roomEnv(renderer, {
    key: 'dark2',
    // THE SHELL IS THE PIECE. `light.dark` is titled "dark you cannot see INTO", and the
    // brief's non-negotiable is that shape stays readable down there — a black cut-out
    // silhouette is the exact failure it exists to disprove. The first real capture of the
    // view produced precisely that: a UNIT-4H four metres from the only lamp rendered as an
    // empty hole with a blue visor floating in it, 68% of the frame at literal zero.
    //
    // The lights cannot fix that, because by construction almost nothing in this room is
    // within reach of a light. Only the IBL can, and at 0.0055 this shell was two orders of
    // magnitude below the level where anything reflects it. Six times brighter and NEUTRAL
    // rather than blue-biased: the hue separation in this room comes from the lamp being
    // warm and the far door being cold, both of which are boxes below, and a blue shell on
    // top of a cold door is the same colour twice.
    ambient: [0.0340, 0.0345, 0.0380],
    boxes: [
      { size: [0.3, 1.4, 1.4], pos: [-3.0, -1.0, 2.5], color: [1.35, 0.78, 0.32] },     // the lamp
      { size: [2.0, 4.0, 0.3], pos: [0.5, 1.0, -11.5], color: [0.245, 0.300, 0.430] },  // cold far door
      { size: [8.0, 0.3, 12.0], pos: [0, -6.5, 0], color: [0.090, 0.078, 0.068] },      // floor bounce
      // A weak DIRECTIONAL element high on the lamp's side. The shell alone is uniform, and
      // a uniform ambient makes an object read as a flat cut-out of a lighter colour rather
      // than as a form — which is the same failure wearing a different value.
      { size: [4.0, 0.3, 4.0], pos: [3.0, 6.5, 1.0], color: [0.115, 0.104, 0.092] },
    ],
  });
}

// ---------------------------------------------------------------------------

/**
 * The one shadow caster. A directional light with an orthographic frustum cropped to
 * `extent` around `focus` — a 1024² map over a 9 m box is 9 mm per texel, which is enough
 * for a contact shadow under a 1.7 m robot; the same map stretched over a 40 m room is
 * 40 mm per texel and every contact shadow turns to mush. Cropping the frustum is the
 * single highest-value shadow setting there is.
 */
export function keyLight(o = {}) {
  const l = new THREE.DirectionalLight(new THREE.Color(o.color ?? 0xffd9a8), o.intensity ?? 2.2);
  l.position.set(...(o.position ?? [-6, 9, 6]));
  l.target.position.set(...(o.target ?? [0, 0, 0]));
  l.castShadow = o.castShadow !== false;
  const size = o.mapSize ?? 1024;
  l.shadow.mapSize.set(size, size);
  const e = o.extent ?? 8;
  Object.assign(l.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
  l.shadow.camera.near = o.near ?? 0.5;
  l.shadow.camera.far = o.far ?? 40;
  l.shadow.bias = o.bias ?? -0.0007;
  l.shadow.normalBias = o.normalBias ?? 0.03;
  l.shadow.radius = o.radius ?? 2.5;
  l.shadow.camera.updateProjectionMatrix();
  return l;
}

/** A shadow-casting spot, for when the motivated source is a lamp rather than a window. */
export function spotKey(o = {}) {
  const l = new THREE.SpotLight(new THREE.Color(o.color ?? 0xffb163), o.intensity ?? 14,
    o.distance ?? 16, o.angle ?? 0.62, o.penumbra ?? 0.55, o.decay ?? 1.7);
  l.position.set(...(o.position ?? [0, 3, 0]));
  l.target.position.set(...(o.target ?? [0, 0, 0]));
  l.castShadow = o.castShadow !== false;
  const size = o.mapSize ?? 1024;
  l.shadow.mapSize.set(size, size);
  l.shadow.camera.near = o.near ?? 0.25;
  l.shadow.camera.far = o.far ?? (o.distance ?? 16);
  l.shadow.bias = o.bias ?? -0.0012;
  l.shadow.normalBias = o.normalBias ?? 0.022;
  l.shadow.radius = o.radius ?? 3;
  l.shadow.focus = 1.0;
  return l;
}

/**
 * THE COOL SIDE — one HemisphereLight, and it is the most important light in the estate.
 *
 * The failure this exists to prevent, measured twice on this project: a warm key plus a
 * warm ambient makes a MONOCHROME frame. Every surface, lit or unlit, lands on the same
 * amber and the image reads as a sepia photograph of nothing. The reference frames
 * (Hitman Paris, Alien: Isolation) are legible in the dark because the shadow side is a
 * different HUE from the lit side, not merely darker.
 *
 * A hemisphere is the cheap correct fix: sky is cold moonlight/skylight, ground is a very
 * dark warm bounce off timber and marble, so an up-facing surface reads cold and a
 * down-facing one reads faintly warm. It adds no per-fragment light loop iteration worth
 * worrying about and no shadow map, and it is what lets the KEY stay desaturated — the
 * colour separation lives between key and fill, never inside the key.
 */
export function hemiFill(o = {}) {
  const h = new THREE.HemisphereLight(
    new THREE.Color(o.sky ?? 0x5b7aa8),
    new THREE.Color(o.ground ?? 0x2a1d12),
    o.intensity ?? 1.0);
  h.position.set(0, 1, 0);
  h.name = 'hemi-fill';
  return h;
}

/**
 * The bounce pair. Two directional lights with no shadow map, one warm from the source
 * side and one cold from the opposite side, both very weak. This is what keeps an
 * unlit robot from becoming a black cut-out without lifting the room's black level.
 */
export function bounceFill(o = {}) {
  const g = new THREE.Group();
  const lights = {};
  // An intensity of 0 is not free — three.js still allocates the uniform slot and every
  // lit fragment still runs the loop iteration. Pass 0 to actually drop the light.
  const dir = (name, col, amt, pos) => {
    if (!(amt > 0)) return;
    const l = new THREE.DirectionalLight(new THREE.Color(col), amt);
    l.position.set(...pos);
    g.add(l, l.target);
    lights[name] = l;
  };
  dir('warm', o.warmColor ?? 0xffb877, o.warm ?? 0.16, o.warmDir ?? [-4, 2, 5]);
  dir('cold', o.coldColor ?? 0x6f8fc4, o.cold ?? 0.11, o.coldDir ?? [5, 3, -4]);
  // A floor bounce coming from below, which is what actually reads on the underside of
  // furniture and on a robot's chin in a room with a marble floor.
  dir('up', o.upColor ?? 0x8a7f6e, o.up ?? 0.07, [0, -5, 1]);
  g.name = 'bounce-fill';
  g.userData.lights = lights;
  return g;
}

/**
 * Grade overrides, per room. The pipeline is shared and cannot be edited, but every view
 * may pass overrides. These are the values settled on by shooting each room and reading
 * the capture; the comments say what each one is fixing.
 */
/**
 * ⚠ THE COLOURED-STREAK GLITCH — root cause, and why every preset below sets `ca: 0`.
 *
 * `critic-estate-2` reported thin coloured vertical streaks on flat panelling in THREE
 * separate pieces — magenta/green on both side walls of `light.shaft`, blue/white on the
 * right wall of `light.dark`, and the same class again in `room.gallery` — and correctly
 * refused to dismiss them as edge chromatic aberration because they sit MID-PANEL, nowhere
 * near a moulding. They are one bug, and it IS the chromatic aberration; the reason it does
 * not look like edge CA is arithmetic.
 *
 * `COMPOSITE_FRAG` samples the three channels at different UVs:
 *     amt = uCA * r2 * 2.4;  dir = (uv - 0.5) * amt;
 *     r = tScene(uv - dir);  g = tScene(uv);  b = tScene(uv + dir);
 * With the pipeline default `ca = 0.0022`, at 1920x1080 near the frame edge that is
 * ~0.95-1.2 px of displacement between R and G, and the same again between G and B.
 *
 * Every room in this estate is full of thin VERTICAL architectural joints — panel stiles,
 * window mullions, frame edges — and on the strongly foreshortened side walls those joints
 * project to roughly ONE PIXEL of screen width. Once the displacement equals the feature
 * width, the three channels are no longer fringing the same feature: each one samples a
 * completely different thing. A neutral 1-px dark joint therefore renders as three adjacent
 * single-channel dropouts, i.e. a saturated yellow/magenta/cyan hairline that follows the
 * joint for its whole length. The colours differ between rooms only because the local
 * content differs; the mechanism is identical.
 *
 * MEASURED, by ablation, at light.shaft (1796, 360) — one pixel, before and after:
 *     ca = 0.0022 ->  (158,144,62) (164,77,121) (102,144,128)   R,G,B each dip 1 px apart
 *     ca = 0.0     ->  (85,64,46)                                one clean neutral hairline
 * The dark joint is real and correct; only its colour was invented by the post pass.
 *
 * The estate cannot afford this effect: it buys about one pixel of film character and costs
 * a hard-reject rendering artifact on the largest flat surfaces in every room. Grain,
 * halation and vignette still carry the photographic read. NOTE FOR THE PIPELINE OWNER (not
 * mine to edit): `POST_DEFAULTS.ca = 0.0022` in `src/post/pipeline.js` has the same effect on
 * any view with sub-pixel detail near the frame edge, and the general fix is to take the CA
 * taps from a blurred source (or clamp per-channel deviation) rather than from `tScene`.
 */
export const GRADES = {
  // The ballroom carries the most bright area of any room, so bloom threshold goes UP or
  // the whole window wall turns to milk, and the vignette comes down because the space
  // has to read as enormous — a heavy vignette makes a big room feel like a diorama.
  // ROUND 5: measured median L 17.7, a FAIL, with 25.1% of the frame at L <= 2.6 and a
  // darkest decile of exactly 0.0. Same three corrections as everywhere else in this file —
  // exposure up (after the ambient, not instead of it), vignette and toe off the black, and
  // the split tints inverted so the highlight stops being tinted amber and the shadow stops
  // being tinted blue.
  // ROUND 6: 1.24 -> 1.12. Round 5's ambient rebalance worked — and then over-shot. Measured
  // on the first capture after it, the ballroom's median pixel came back at L 72.5 against
  // the gate's 30-60 band and the locked art's 37.5, with the chequer floor washing toward a
  // sheet. Exposure is the safe lever here, unlike round 5's problem: the top-decile chroma
  // is already 0.111 against the art's 0.093, and pulling the whole curve down does not move
  // a ratio.
  // ROUND 7: 1.12 -> 1.015. `critic-estate-2` re-measured the median at 64.5 against the
  // 30-60 band and did NOT reproduce the builder's claimed 60.6 — over the washed-out line
  // either way, and the capture agrees (64.1). Same reasoning as rounds 5 and 6: the chroma
  // is already passing at 0.112, and pulling the whole curve down does not move a ratio.
  // ROUND 4 (estate-owner-5): 1.015 -> 0.985. `wallRun` no longer draws panel fields across
  // window openings (see the auto-skip note in kit.js), so five 2.08 m plates came off the
  // FRONT of the window wall's glazing line and the room got the daylight it was always
  // supposed to have. Measured effect: median 57.0 -> 59.1, i.e. right on the top edge of the
  // 30-60 band. Same reasoning as rounds 5-7: chroma is a ratio and does not move with
  // exposure (it measured 0.086 at 1.015), so exposure is the safe lever for the median.
  // ROUND 11 (estate-owner-11): exposure 0.985 -> 1.05, `gain` overridden NEUTRAL, and
  // shadowTint pulled most of the way to neutral. This is a consequence of the floor
  // reflection landing in `room-ballroom.js`, and the honest version of the story is worth
  // the space:
  //
  // The near third of that frame used to be a structureless pale wash — polished marble
  // returning a five-box IBL at grazing incidence — and it was a large NEUTRAL bright area
  // that dominated the top decile and held the chroma gate at a comfortable 0.083. With the
  // floor reflecting the actual room, that wash is gone, the top decile becomes gilt and
  // candlelight, and the same grade measured **0.193 — a WARN**. Nothing got warmer; a
  // defect that had been diluting the measurement was removed. **A gate figure carried by a
  // bug is worth re-deriving whenever the bug is fixed.**
  //
  // What actually fixed it was not exposure and not the shadows. Swept in one boot with
  // `harness/_tmp_eo11_grade.mjs` (top-decile (r-b)/L, then median):
  //     shadowTint -> neutral            0.193      (dark tiles 1.019 -> 0.942, barely moves)
  //     exposure 1.05 / 1.18 / 1.30      0.188 / 0.178 / 0.170   and 1.18 breaks the median
  //     gain -> [1,1,1]                  **0.138**  median 49.7
  //     gain neutral + exposure 1.05 + shadowTint 1.02/0.99/0.95   **0.127** median 53.9
  // `gain: [1.02, 1.0, 0.965]` lives in the shared `estate` PRESET, i.e. a 5.7% warm skew
  // applied across the whole range of every estate view, and it is the single largest term in
  // this room's chroma. Overridden here only — the other five views were measured on it and
  // are not mine to move.
  //
  // It is also the right direction against the reference rather than only against the gate.
  // Tile-grid comparison against `refs/bf1/bf1-ballroom-01.png`, median (r-b)/L per luminance
  // bucket, render vs art: L25-60 **0.669 vs 0.441**, L60-110 **0.688 vs 0.398**. This render
  // was measurably warmer than its own reference at every level, not just at the top.
  // ROUND 12 (estate-owner-12): exposure 1.05 -> 1.28, vignette 0.26 -> 0.17, haze 0.016 ->
  // 0.026, toeCrush 0.005 -> 0, a small `lift`, and `highlightTint` inverted from warm to COOL.
  // Every one of those is a consequence of the lighting rebalance in `room-ballroom.js`
  // (`?daylight=flat` puts BOTH back, and the view carries the old values so the ablation is a
  // real reproduction) and each was solved on the same boot as the thing it trades against,
  // with `harness/_eo12_gradesweep.mjs` printing the gate and the 32-px macro variation in one
  // table. That pairing is the point: they pull against each other and no existing tool could
  // see both.
  //
  //   the room's IBL shell 3.2 -> 1.70, the one daylight spot 300 -> 19400
  //     un-recentred                 top 0.148  median 24.0  toe 1.1   FAIL median / WARN chroma
  //     exposure 1.28 + lift + toe0  top 0.116  median 41.0  toe 4.7   all PASS
  //
  // ⚠ `highlightTint` HAD TO BE INVERTED AND IT IS THE ONLY FREE LEVER HERE. Taking the flat
  // shell out makes the room's brightest pixels the CANDLELIGHT and the gilt frieze instead of
  // a neutral IBL wash on marble, and the top-decile chroma went 0.127 -> 0.148, a WARN, with
  // nothing having got warmer. Cooling the highlight tint from 1.015/1.00/0.985 to
  // 0.975/1.00/1.030 moves it 0.148 -> 0.126 at **zero cost to any macro number** (0.6293 ->
  // 0.6296 on the lit floor). Every other candidate — exposure, saturation, haze — buys the
  // same chroma by flattening the picture. This is the same lesson as round 11's `gain`:
  // a chroma gate is a RATIO and the cheapest honest fix is a ratio, not a level.
  //
  // The direction is right against the reference and not only against the gate.
  // `harness/grade.mjs --img refs/bf1/bf1-ballroom-01.png` reads the locked art at
  // **top-decile chroma 0.089 over a decile L of 217.7** — its brightest tenth is a BLOWN,
  // NEUTRAL sun patch (2.4% of that frame is at L >= 250) sitting over mid-tones whose chroma
  // runs 0.33-0.40. Ours was a warm top over cooler mids, i.e. inverted.
  //
  // ROUND 15 (estate-owner-15): `critic-estate-12`'s fastest tell — the art's sun hotspot still
  // shows its window-mullion grid projected on the floor; ours bloomed to a near-featureless
  // white blob — NOW HAS A MEASURED MECHANISM, and it is bloom, not the shadow map and not the
  // spot's intensity.
  //
  // ⚠ PROVED BY ABLATION, NOT ASSUMED. `harness/_eo15_hotspot_sweep.mjs` boots this view once and
  // sweeps `setGrade()` patches live, reading a local-contrast stat (std/mean over 8x8 blocks) on
  // the hotspot region alongside `grade.mjs`'s own top-decile chroma:
  //
  //     variant                topChroma  medianL  toeL   hsStd/mean (contrast in the patch)
  //     base (pre-round)          0.055     34.0    7.9      0.668
  //     bloomStrength: 0           0.184     27.1    5.9      0.931   <- the grid is THERE
  //     bloomRadius alone -> 0.1-0.5                                   0.72-0.74  (small win, plateaus)
  //     bloomThreshold alone -> 15-50                                  0.91-1.14  (works, but drags
  //                                                                      medianL to 23-27, a WARN —
  //                                                                      bloom was carrying real
  //                                                                      share of the frame's median)
  //     bloomThreshold 15 + exposure 1.50   0.086     34.0    7.0      0.820   <- shipped
  //
  // `bloomStrength: 0` alone (the break test) proves the mullion shadow DOES resolve through the
  // shadow map at full contrast — the grid is fully legible with bloom off entirely (see the
  // crops in the round's report). So the shadow map, the mullion geometry and the spot's 19400
  // intensity are NOT the cause; they were never the suspect once this ran. The post-process bloom
  // pass is: its 13-tap Karis-downsample threshold gate lets the whole hotspot in at the old 1.25,
  // and the upsample chain then adds a wide blurred halo BACK ONTO the shadowed grid lines,
  // filling them in — a case of the fix and the defect being the same feature at different radii.
  // `bloomRadius` alone cannot fix this: most of the destructive spread comes from mip levels
  // whose texel size is already large in frame terms by the time `uRadius` scales their step, so
  // even `bloomRadius: 0.1` plateaus at hsStd/mean ~0.74 — a third of the way to the fix. Raising
  // `bloomThreshold` is what actually excludes the hotspot's extreme HDR values from the bloom
  // accumulator, but bloom was quietly propping up the frame's overall median (unsurprising: it is
  // additive light over a large area), so threshold alone bought contrast at the cost of the
  // median gate. `exposure` restores the median losslessly, per this file's own established
  // lesson (rounds 6/7/4 above): it moves the whole curve and does not manufacture a ratio, so it
  // does not fight the chroma or contrast win, and empirically the median came back to exactly
  // 34.0 — the same number the pre-round gate carried — at exposure 1.50.
  // ⚠ THIS IS A GLOBAL BLOOM CHANGE, so it also affects the window glass and the practicals' own
  // bloom contribution, not only the floor patch. Checked in the full frame, not just the crop:
  // the window wall does not "turn to milk" (the failure mode the ROUND 5 comment above warns
  // about) — if anything a HIGHER threshold moves further from that failure, and the chandelier
  // and sconce glows are unaffected because they are authored emissive sprites, not bloom-pass
  // dependent (see the light-count note in room-ballroom.js). Patch edges at the hotspot are
  // still soft, not aliased — `bloomStrength` is untouched at 0.070, so whatever survives past the
  // new threshold still blooms exactly as before.
  ballroom: {
    // ROUND 15: 1.28 -> 1.50 for the bloom-threshold fix (see the note above), then -> 1.55
    // alongside `toeCrush` below once ITEMS 2 and 3 (room-ballroom.js: the vestibule and drape
    // albedos) needed a second, joint pass — see that comment for the full reasoning. Solved
    // together on one boot, `harness/_eo15_vest_sweep.mjs`, because exposure and toeCrush both
    // move median AND toe and cannot be tuned one item at a time without re-fighting each other.
    // ROUND 17: 1.55 -> 1.28, as the third of the three terms in the key/fill re-solve. See
    // the long note on `sun`/`bounce` in room-ballroom.js's LIGHTS block for the measurement
    // chain — this number is NOT the fix on its own (two stops of blown key cannot be graded
    // away, and 1.55 -> 0.90 was tried and does not reach it) and it must not be re-tuned
    // without the other two, which is the trap the round-15 note above describes.
    // ROUND 17 second pass: 1.28 -> 1.45, the third term of the re-solve that puts this room on
    // the bar's own ladder (median 48.8/49.8, toe 10.6/11.3). See the LIGHTS block in
    // room-ballroom.js — it does not move without `sun` and `bounce`.
    exposure: 1.45,
    gain: [1.0, 1.0, 1.0],
    ca: 0.0,                    // see the streak-glitch note above the GRADES table
    bloomStrength: 0.070, bloomThreshold: 15, bloomRadius: 1.05,
    halation: 0.042,
    vignette: 0.17, vignetteRound: 0.94,
    contrast: 1.06, saturation: 1.02,
    /**
     * ---- ROUND 18: THE ONLY KNOB IN THE ROUND SHAPED LIKE A SLOPE ------------------------
     *
     * This room matched the reference's LUMINANCE ladder decile for decile and could not match
     * the SHAPE of its chroma ladder. The bar's chroma is nearly flat from decile 2 to 9 (0.40
     * down to 0.34); this room's ramped (1.03 down to 0.00). Ten global terms were swept at it —
     * the three bounce fills, the sun colour, the environment's candle boxes and its ambient,
     * the toe, the haze colour, the split tone, the drape, the cornice — and every one of them
     * ROTATED the ladder, because a global multiply or tint cannot change a slope. Deciles 2-3
     * sat above the bar and 5-8 below it, so pulling either end further cost the other.
     *
     * The slope's cause is the TONEMAPPER: ACES is fitted in a space where rising luminance
     * pulls toward the white point, so it desaturates highlights hard and nothing downstream
     * puts any back. Nothing in the room could ever have fixed it. `uToneChroma` (see the
     * tonemap block in post/shaders.js) tonemaps the LUMINANCE and keeps the scene's own chroma
     * ratio, blended against plain ACES; it defaults to 0 everywhere so no other piece moves.
     *
     *     toneChroma      d1     d2     d3     d4     d5     d6     d7     d8     d9    d10
     *     bar            0.79   0.40   0.38   0.40   0.36   0.36   0.34   0.33   0.34   0.09
     *     0.00           1.03   0.90   0.57   0.40   0.25   0.22   0.24   0.24   0.10   0.00
     *     0.45           0.90   0.80   0.52   0.36   0.23   0.21   0.24   0.24   0.11   0.05
     *     0.85           0.78   0.72   0.46   0.33   0.22   0.20   0.24   0.24   0.12   0.10
     *
     * ⚠ 0.85 LANDS BOTH ENDS EXACTLY AND IS NOT WHAT SHIPS. It takes the sun patches visibly
     * yellow and the shaded floor toward teal — the ladder is a summary, and a summary can be
     * satisfied by a picture that is worse.
     *
     * 🚨🚨 **AND 0.45 DOES NOT SHIP EITHER, FOR THE THIRD TIME IN THIS ROUND AND FOR THE SAME
     * REASON. IT WAS JUDGED AT ONE CAMERA AND IT IS SPENT AT SEVENTEEN.**
     *
     *     angle          toneChroma 0 -> 0.45
     *     overlook          0.005 -> 0.042
     *     eye.win           0.071 -> 0.232   PASS -> FAIL
     *     eye.mirror        0.135 -> 0.335   PASS -> FAIL
     *     eye.door          0.208 -> 0.382
     *     eye.up            0.309 -> 0.466
     *
     * Of course it does: the term puts saturation BACK into highlights, and the chroma gate is
     * a measurement OF the highlights. At `overlook` the top decile is blown window glare,
     * which is neutral and has no chroma to restore; everywhere else it is sunlit oak and
     * gilding, which have plenty. The one framing where this looks free is the one framing
     * whose top decile is not made of the thing being changed — the SAME blind spot that let
     * the gate pass this room for four rounds in the first place.
     *
     * ⚠ SO THE TERM STAYS IN THE PIPELINE AT 0 AND THE FINDING STANDS: the ramp is the
     * tonemapper, nothing in the room can flatten it, and flattening it here costs more at
     * sixteen cameras than it wins at one. Closing this properly means a tonemap whose highlight
     * desaturation is a function of what is IN the highlight, not a global blend between two
     * curves. That is a piece of colour science rather than a knob, and it belongs in a round of
     * its own with every piece in the project re-shot.
     */
    toneChroma: 0.0,
    /**
     * 🆕 **`toeSat` 0.35 — THE OTHER HALF OF THE RAMP, AND THE HALF `toneChroma` COULD NOT BUY.**
     *
     * Round 44 stopped arguing about which OBJECT is too warm and split deciles 2-3 by hue class
     * instead. The shape it found is not the one the last four rounds assumed:
     *
     *     deciles 2-3        red    amber  warm-grey  neutral   cool     mean (r-b)/L
     *     bar               12.4%   25.8%    18.3%     18.2%   11.2%         0.39
     *     here              51.1%   31.1%     7.5%      3.7%    6.0%         0.71
     *
     * This room's reds are individually LESS saturated than the bar's (mean r-b 26.1 against
     * 34.8) — there are four times as many of them, and almost nothing in the dark band is
     * neutral: the bar's shadows are 47.7% neutral-or-cooler and this room's are 17.2%. So the
     * excess is spread across half the pixels rather than sitting on one object, which is why
     * `_giltdust44` — desaturating the gilt's own albedo, the thing round 18 named — moved
     * decile 2 from 0.90 to 0.82 at FULL strength and cost the gilding everywhere to do it.
     * Rejected on its own measurement.
     *
     * `uToeSat` desaturates by pixel luminance with a weight that is zero above L 0.20, i.e.
     * above this room's own decile 5. Measured on one boot per camera, sweeping the uniform:
     *
     *     toeSat        d1     d2     d3     d4     d5    d6    d7    d8    d9   d10
     *     bar          0.79   0.40   0.38   0.40   0.36  0.36  0.34  0.33  0.34  0.09
     *     0.00         1.03   0.90   0.57   0.40   0.25  0.22  0.24  0.24  0.10  0.00
     *     0.35         0.81   0.78   0.53   0.39   0.25  0.22  0.24  0.24  0.10  0.00
     *     0.55         0.69   0.70   0.51   0.38   0.25  0.22  0.24  0.24  0.10  0.00
     *     0.75         0.57   0.63   0.48   0.37   0.24  0.22  0.24  0.24  0.10  0.00
     *
     * ⚠ **DECILES 3-10 ARE UNCHANGED AT EVERY VALUE AND AT ALL FOUR CAMERAS, WHICH IS THE WHOLE
     * ARGUMENT FOR THIS TERM OVER `toneChroma`.** The note above records why 0.45 of that one did
     * not ship: it takes the top-decile chroma gate from 0.071 to 0.232 at `eye.win`, PASS to
     * FAIL, because it puts saturation back into the highlights and the gate measures the
     * highlights. This term cannot reach them.
     *
     * ⚠ **0.35 RATHER THAN MORE, AND THE VALUE IS NOT FITTED — IT IS WHERE TWO INDEPENDENT
     * FRAMINGS LAND ON THE REFERENCE.** Decile 1 at 0.35: `overlook` 0.81 and `eye.door` 0.79,
     * against the bar's 0.79. `eye.win` improves 1.47 -> 1.23 and `eye.mirror`, whose darkest
     * decile was already BELOW the bar at 0.40, gives up 0.05. Higher values keep taking decile 2
     * down at `overlook` and push decile 1 under the bar at three cameras out of four.
     *
     * ⚠ **THE GAME DOES NOT GET THIS.** `views/game.js` grades the whole house with one block,
     * so shipping a term there that was derived from one room's ladder is the mistake this file
     * keeps recording. It is a per-piece grade field and it stays on the piece it was measured on.
     */
    toeSat: 0.65,
    /**
     * 🆕 **AND THE TOE WEIGHT IS A HUMP OVER DECILES 2-3, BECAUSE THE TARGET IS NOT MONOTONIC.**
     *
     * The reference's own chroma ladder is 0.79 / 0.40 / 0.38 / 0.40 — a spike in the darkest
     * tenth and then flat. A weight that falls from black, which is what this term shipped with
     * at 0.35, takes the MOST out of decile 1 and the least out of 2 and 3: it landed decile 1
     * exactly and left decile 2 at 0.78 against 0.41, the largest single error in the frame, and
     * no amount of it could reach decile 2 without pulling decile 1 under.
     *
     *     toeSat / lo / hi        d1     d2     d3     d4
     *     bar                    0.79   0.40   0.38   0.40
     *     0.35 / 0    / 0.20     0.81   0.78   0.53   0.39     (the falling weight)
     *     0.55 / 0.09 / 0.20     0.49   0.48   0.40   0.36     (rise from black: takes both down)
     *     0.65 / 0.105/ 0.22     0.58   0.36   0.30   0.30
     *     0.65 / 0.125/ 0.24     0.79   0.43   0.25   0.25     (right at the top, too wide)
     *     0.65 / 0.125/ 0.175    0.80   0.44   0.33   0.36     <- shipped
     *     0.80 / 0.115/ 0.165    0.62   0.30   0.36   0.38
     *
     * ⚠ **THE RISE STARTS AT HALF THE KNEE AND THAT IS THE WHOLE MECHANISM.** Rising from black
     * gives decile 1 half the weight of decile 2 — a ratio of two — so it takes both down
     * together where the reference DROPS between them. Starting at `lo * 0.5` puts ~0.01 at
     * decile 1 against ~0.87 at decile 2, which is the separation the target has.
     *
     * ⚠ **AND THE BAND WAS NARROWED TWICE, IN THE PIPELINE'S SPACE RATHER THAN THE HISTOGRAM'S.**
     * `lo`/`hi` are luma BEFORE the 1.05 contrast expansion, so a band placed by reading decile
     * luminances off the final frame lands lower than intended — the same trap `uMidWarm`'s
     * comment records. 0.125/0.24 landed deciles 1-2 exactly and took 3 and 4 to 0.25; the fall
     * came in to 0.175 and gave them back.
     */
    toeSatLo: 0.125,
    toeSatHi: 0.175,
    /**
     * 🆕 **`midWarm` 0.12 — CHROMA BACK IN THE MIDDLE OF THE LADDER, WHERE THE BLUE SHELL TOOK IT.**
     *
     * The other end of the same round. Deciles 5-9 read 0.25 / 0.22 / 0.24 / 0.24 / 0.10 against
     * the bar's flat 0.36 / 0.36 / 0.34 / 0.33 / 0.34, and round 44 located why: `ballroomEnv`'s
     * window-wall box is [2.60, 2.72, 2.95], r/b 0.881, so every surface the sun does not reach
     * is lit blue. `_coolmask44` paints it — the halo of floor around every sun bar — and
     * `_coldwho44 env-off` prices it: deciles 7-9 land on the reference and the median falls
     * 49.3 to 29.6, because that shell is this room's fill as well as its cold.
     *
     * ⚠ **THE LIGHT-SIDE FIX WAS BUILT FIRST AND THE BOARD REFUSED IT.** `?day=` tints that box
     * with luminance held constant; at 0.5 it buys deciles 5-9 +0.02 to +0.03 and takes
     * `eye.mirror` PASS -> WARN and `eye.gallery` WARN -> FAIL, i.e. 13/2/2 -> 12/2/3. A light
     * term reaches the top decile and the chroma gate IS the top decile. Same refusal, same
     * rule, as `toneChroma` one round earlier.
     *
     * This term is shaped so it cannot: the weight rises over L 0.16-0.30 and is zero by 0.60,
     * and it rotates chroma with the luminance put back, so a sweep can only move colour.
     * Measured at `overlook`, median 49.3 on every row:
     *
     *     midWarm     d1     d2     d3     d4     d5    d6    d7    d8    d9   d10
     *     bar        0.79   0.40   0.38   0.40   0.36  0.36  0.34  0.33  0.34  0.09
     *     0.00       0.81   0.78   0.53   0.39   0.25  0.22  0.24  0.24  0.10  0.00
     *     0.12       0.82   0.78   0.53   0.39   0.28  0.29  0.33  0.33  0.18  0.01
     *     0.20       0.82   0.78   0.53   0.40   0.31  0.33  0.39  0.39  0.22  0.01
     *     0.30       0.82   0.78   0.53   0.41   0.34  0.38  0.46  0.47  0.29  0.01
     *
     * ⚠ **0.12 BECAUSE IT OVERSHOOTS NOTHING.** 0.20 and 0.30 fit the sum of errors marginally
     * better and get there by taking deciles 7-8 PAST the bar to 0.39 and 0.47 — a ladder that
     * crosses the reference is not a closer match, it is a different error, and this room has
     * spent two rounds learning that a summary can be satisfied by a worse picture. At 0.12
     * every decile moves toward the reference and none moves past it; deciles 7 and 8 land on
     * it exactly.
     *
     * ⚠ **THE FIRST BAND WAS TUNED IN THE WRONG SPACE.** It rose over L 0.06-0.18 because
     * deciles 5-9 sit at 0.175-0.378 in the measured ladder — but the ladder is measured on the
     * final 8-bit frame, after this block and a 1.05 contrast expansion, so the same number
     * means a lower pixel here. It lifted deciles 2-4 (0.78 / 0.53 / 0.39 -> 0.90 / 0.73 / 0.63)
     * as hard as the band it was aimed at. Raised, deciles 1-3 do not move at all.
     */
    midWarm: 0.12,
    // toeCrush 0 and a small lift, because the rebalance put 6.0% of the frame at L <= 2.6 and
    // the locked art holds 0.1%. Crushed black is a render tell in its own right and it was
    // about to be bought with the macro win.
    lift: [0.014, 0.020, 0.028],
    // ROUND 15: 0.0 -> 0.018 (via an intermediate 0.010), paired with `exposure` above. Not a
    // re-litigation of the line above — this compensates the OTHER direction. Brightening the
    // drape material alone (room-ballroom.js, ITEM 3) to where it actually reads as red velvet
    // pushed the darkest-decile L from this round's post-bloom-fix 7.0 to 9.6, a WARN — the
    // panels cover real screen area at all five windows and were previously near-zero, so
    // bringing them up to a legible red promotes a chunk of the frame's own darkest decile
    // rather than just recolouring a few pixels. Brightening the VESTIBULE too (ITEM 2) costs
    // the same budget a second time (from literal (0,0,0) — see that comment). Both items were
    // swept jointly against toeCrush AND exposure together (`harness/_eo15_vest_sweep.mjs`,
    // which patches `kit:drape`, `kit:vest` and the grade in one boot): toeCrush alone
    // (0.008/0.010/0.012) traded toe for median 1-for-1ish (0.010 -> toe 7.5, median 32.0) but
    // left no room for the vestibule too; adding exposure 1.50 -> 1.55 back on top recovers the
    // median toeCrush 0.018 costs (31.8, comfortably inside 30-60) without undoing all of the
    // toe win (7.5, inside 2-8) or re-blowing the ITEM 1 hotspot (top-decile chroma 0.088,
    // unchanged from the bloom fix's own 0.086-0.087). black% (pixels at L<=2.6) rises to ~0.5%,
    // nowhere near the 6% crushed-black failure the line above exists to avoid.
    // ---- ROUND 18, LAST PASS: 0.018 -> 0.0, AND THE LIFT GOES COOL WITH IT ----------------
    //
    // 🚨 **THIS ROOM WAS CRUSHING HARDER THAN THE REFERENCE AND THE CHROMA METRIC WAS BEING
    // PAID FOR IT TWICE.** Round 18 matched the ladder through deciles 5-8 and could not close
    // deciles 1-4. The characterisation that finally moved it: at decile 3 this room reads
    // 30.4 / 21.0 / 12.7 against the bar's 31.0 / 27.1 / 20.6 — the RED MATCHES, and green and
    // blue are both low. That is not "too much warm light", which is what four sweeps had been
    // chasing; it is a shade that has had its bottom pulled out.
    //
    // And (r-b)/L divides by L, so a harder crush inflates the ratio on top of the real
    // difference. Against the bar: darkest decile 8.4 against its 11.3, black% 0.2 against 0.1.
    // Both say the same thing.
    //
    //     ladder             d1     d2     d3     d4     d5     d6     d7     d8   median
    //     bar               0.79   0.40   0.38   0.40   0.36   0.36   0.34   0.33   49.8
    //     toeCrush 0.018    1.40   1.08   0.79   0.62   0.42   0.33   0.33   0.32   46.2
    //     0.0 + cool lift   0.84   0.78   0.59   0.48   0.33   0.26   0.28   0.27   47.6
    //
    // Decile 1 lands on the bar (0.84 against 0.79), the toe goes 8.4 -> 10.0 against its 11.3,
    // and black% lands on it exactly (0.1%). Total absolute ladder error nearly halves.
    //
    // ⚠ THIS DOES NOT UNDO ROUND 15, WHICH RAISED IT. That round set 0.018 against a build with
    // **6.0%** of the frame at L <= 2.6 — crushed black is a render tell and it was right to
    // fix. This build sits at 0.2% before the change and 0.1% after, so the condition that
    // justified the crush no longer exists, and the crush is now costing the shade instead.
    // Checked in the picture as well as the number: the coffers, the corners and the arched
    // opening all stay deep; what opens up is the floor's dark half, which in the reference is
    // a mid olive-grey with detail in it rather than near-black.
    //
    // ⚠ AND THE LIFT IS DELIBERATELY BLUE-SHIFTED. It was [0.013, 0.0125, 0.012], i.e. flat.
    // The deficit measured above is specifically in GREEN and BLUE, so a flat lift would buy
    // the level back and leave the colour wrong.
    toeCrush: 0.0,
    /**
     * ⚠ **THE HAZE WAS WARM AND HAZE IS APPLIED BY DISTANCE, SO IT WAS A WARM FILM OVER THE FAR
     * HALF OF THE ROOM — WHICH IS ALSO THE DARK HALF.** [0.058, 0.056, 0.052] is r/b 1.115.
     * Round 18's last open gap was deciles 1-4 running warm with the RED MATCHING the bar and
     * green and blue both low, and this is the only term in the frame shaped like that: it
     * cannot touch the near, bright half at all. Cooling it to r/b 0.64 takes decile 1 from
     * 0.97 to 0.80 against the bar's 0.79 at an UNCHANGED median (49.6 -> 49.5).
     */
    haze: 0.026, hazeColor: [0.046, 0.056, 0.072],
    // ---- ROUND 17, FOURTH PASS: THE SPLIT-TONING WAS INVERTED AGAINST THE BAR --------------
    //
    // `shadowTint` was [1.02, 0.99, 0.95] — R up, B down, i.e. a WARM shadow — and once the
    // room's ladder matched the reference that became the fastest remaining tell in a blind
    // pair. Measured on matched props: the bar's sheeted mounds read 48.0, 47.8, 46.3 in shade,
    // chroma 1.7, essentially neutral; this room's shaded props were running chroma 30+. Its
    // whole depot read as gold where the reference's reads as grey timber and grey linen, and
    // no prop albedo fixes that because the tint is applied to all of them at once, after
    // tonemapping.
    //
    // Cooling the shadow end is also FREE against this piece's tightest gate: `grade.mjs`
    // measures (r-b)/L in the TOP decile, and this term is weighted by pow(1-L, 2), so it does
    // essentially nothing up there. `highlightTint` is deliberately NOT inverted to match — the
    // bar's sun patches are warm and warming ours further is the obvious move, but the top
    // decile is already at 0.129 of a 0.14 target with the gilding spending most of it, and
    // that is the ceiling this round already documented at the daylight's own colour.
    /**
     * ⚠ **AND THE HIGHLIGHT TINT IS NO LONGER NEUTRAL, WHICH REVERSES A ROUND-17 DECISION ON
     * EVIDENCE THAT ROUND DID NOT HAVE.** Its note says highlightTint is "deliberately NOT
     * inverted to match" because the top decile was at 0.129 of a 0.14 target and could not
     * afford it. That ceiling is gone: the top decile now reads 0.010 and the BAR reads 0.089,
     * so this room is the one that is too COOL up there.
     *
     * The deeper reason is the ladder's shape. The bar's chroma is nearly FLAT from decile 2 to
     * decile 9 (0.40 down to 0.34); this room's RAMPS (0.87 down to 0.14), because ACES
     * desaturates highlights and nothing puts any of it back. Cooling the haze pulls the bottom
     * of that ramp down; warming this would push the top up, and the two together are the only
     * pair of knobs shaped like a ramp.
     *
     * 🚨 **AND IT STAYS NEUTRAL ANYWAY, BECAUSE IT WAS TRIED AT SEVENTEEN CAMERAS AND IT ONLY
     * WORKS AT ONE.** [1.14, 1.00, 0.86] at splitBalance 0.75 lands `overlook`'s decile 1 on
     * 0.79 exactly and its decile 10 on 0.13 against the bar's 0.09 — a near-perfect ladder.
     * Moderated to [1.075, 1.00, 0.925] at 0.65 and shot at the angles that actually stress it:
     *
     *     angle           before   with the warm highlight
     *     overlook         0.010            0.070   (better)
     *     eye.door         0.216            0.287   (worse)
     *     eye.gallery      0.186            0.247   (WARN -> FAIL)
     *     eye.up           0.320            0.376   (worse)
     *
     * One angle bought and three sold, and `eye.gallery` regressed a band. A GRADE TERM IS
     * SPENT AT EVERY CAMERA. This is the same mistake the whole round exists to correct — the
     * chroma gate only ever passed because it was measured at `overlook` — and it was very
     * nearly made again from the other direction, by tuning a global term against one ladder.
     */
    shadowTint: [0.985, 0.995, 1.025], highlightTint: [0.985, 1.00, 1.015],
    splitBalance: 0.55,
    aoIntensity: 1.30, aoRadius: 0.85,
    grain: 0.026,
  },
  // The study is a dark walnut box with one hard shaft. Round 2 of this view came back as a
  // black frame with a shaft in it: exposure 1.02 over an ambient of 0.024 left the
  // panelling, the chimneypiece and every prop below the noise floor. So exposure goes up
  // hard, and the COLOUR SEPARATION is pushed through the grade rather than through the
  // lights — splitBalance 0.68 with a strongly cool shadowTint against a warm highlight
  // tint is what keeps a lifted frame from turning into one flat amber. Vignette carries
  // the "near-black corners" the locked art has, so the lift does not have to be paid for
  // by losing them.
  // ROUND 4. Every number here moved, and `harness/grade.mjs --img <shot> --ref <art>` is
  // why. Measured on the round-3 capture against Dev Art/1785319916301:
  //
  //                        render      art      what it meant
  //   median pixel L          8.9     37.5      the frame was four stops under
  //   pixels at L <= 2.6     34.8%     4.9%     a third of the image was literally zero
  //   top-decile (r-b)/L    0.308    0.093      the highlights were orange, not white
  //
  // The three lines below that do most of that work are the split tints, the vignette and
  // the toe. `shadowTint` was 0.74/0.88/1.18 — a strong BLUE pushed into the dark end — on
  // an argument about avoiding sepia. The art's dark end is the warmest part of the image
  // and its coolest cell of 144 is still +0.5 warm, so the blue was inventing a hue the
  // reference does not contain while the amber it was meant to counter was up at the TOP,
  // where highlightTint 1.08/0.87 was putting it. Both are inverted now: warm shadow,
  // colourless highlight. The vignette went 0.60 -> 0.24 because the art's corners are dark
  // from being unlit, not from being multiplied by zero, and toeCrush 0.022 -> 0.005 because
  // the art holds its darkest decile at L 2.7 rather than crushing it out.
  // ROUND 5: 1.38, not 1.50. With the round-5 camera 1.3 m closer to the marble the frame's
  // median came out at 44.2 against the art's 37.5 — the mid-tone problem round 4 fixed has
  // over-shot in the other direction, and unlike round 4's the correction is safe to make on
  // exposure because the top-decile chroma is already at 0.092 against the art's 0.093 and
  // pulling the whole curve down does not move a ratio.
  study: {
    exposure: 1.38,
    ca: 0.0,                    // see the streak-glitch note above the GRADES table
    bloomStrength: 0.052, bloomThreshold: 1.20, bloomRadius: 1.0,
    halation: 0.042, halationTint: [1.0, 0.74, 0.56],
    vignette: 0.24, vignetteRound: 0.92,
    contrast: 1.05, saturation: 1.02,
    lift: [0.011, 0.009, 0.007],
    toeCrush: 0.005,
    // Haze is the cheapest mid-tone lift there is and it is the one the art actually uses:
    // every distant pixel is mixed toward `hazeColor` BEFORE the tonemap, so the far wall
    // cannot fall below it however dark its albedo. That is what stops a walnut room having
    // a hole in the back of it, and it costs one depth fetch that the pass already makes.
    haze: 0.017, hazeColor: [0.062, 0.055, 0.046],
    shadowTint: [1.05, 0.96, 0.84], highlightTint: [1.015, 1.00, 0.985],
    splitBalance: 0.60,
    aoIntensity: 1.30, aoRadius: 0.70,
    grain: 0.028,
  },
  // The gallery is a recession: haze does the depth work, so it is the highest here.
  gallery: {
    exposure: 1.22,
    ca: 0.0,                    // see the streak-glitch note above the GRADES table
    bloomStrength: 0.075, bloomThreshold: 1.02, bloomRadius: 1.1,
    halation: 0.048,
    // 0.30, not 0.70. The slice plan names this directly: a 0.70 vignette on a frame that was
    // already 77% black is most of the black, and the locked art's corners are dark because
    // the room is dark there, not because a post pass multiplied them by zero.
    vignette: 0.30, vignetteRound: 0.86,
    contrast: 1.08, saturation: 1.02,
    lift: [0.010, 0.009, 0.008],
    toeCrush: 0.006,
    haze: 0.028, hazeColor: [0.052, 0.052, 0.056],
    // INVERTED, for the same reason the study's were in round 4 and it is worth stating once
    // more because this preset is where the effect is largest: `highlightTint` 1.09/1.00/0.86
    // is a multiplier that pushes r up 9% and b down 14% AT THE TOP OF THE RANGE, which is
    // precisely where `grade.mjs` measures chroma. The gallery's top-decile (r-b)/L came back
    // at 1.93 — ten times the fail line — and roughly a quarter of that was this line alone.
    // Warm shadow, colourless highlight; the art is warm in shadow and neutral in light.
    shadowTint: [1.05, 0.96, 0.85], highlightTint: [1.015, 1.00, 0.985],
    splitBalance: 0.60,
    aoIntensity: 1.40, aoRadius: 0.75,
    grain: 0.030,
  },
  // Alien: Isolation. Crushed toe, strong cold shadow tint, low bloom threshold so the one
  // practical actually blooms, and the heaviest vignette in the set.
  // Alien: Isolation. ROUND 4 — and every value that moved here moved because the piece was
  // failing its own definition, not because it was failing the daylight gate.
  //
  // Three settings were each independently sufficient to produce a black frame: a 0.86
  // vignette (the heaviest in the set, on the darkest scene in the set), toeCrush 0.030
  // pulling the bottom three deciles to exactly zero, and exposure 1.00 on a room whose
  // brightest surface is a shaded desk lamp. Together they put 68% of the capture at literal
  // zero and turned the figure into a cut-out.
  //
  // What is KEPT is the character: the low bloom threshold so the one practical genuinely
  // blooms, the chromatic aberration, and the coarse grain. Those are what make it read as a
  // photograph of a dark room rather than as an underexposed render. What is dropped is
  // everything that was removing information rather than shaping it. `toeCrush` in
  // particular: this is the ONE view where the darkest decile is the measurement that
  // matters, and crushing it to zero is answering the question by deleting it.
  dark: {
    exposure: 1.34,
    bloomStrength: 0.090, bloomThreshold: 0.88, bloomSoftKnee: 0.5, bloomRadius: 1.15,
    // ROUND 5: same correction as `chandelier`. Halation multiplies the top of the range and
    // this tint is the most saturated in the file — on the view whose measured top-decile
    // (r-b)/L was 0.572, four times the target. It stays warm because the source is an oil
    // lamp; it stops being a sepia filter applied to the one bright thing in frame.
    // ROUND 6: 0.048/[1.0,0.84,0.72] -> 0.032/[1.0,0.94,0.90]. Halation is a MULTIPLIER on the
    // top of the range that then bleeds outward, so on the one view whose bright content is a
    // single small source it is not a subtle film effect — it is a sepia wash painted around
    // the only pixels the chroma gate measures, and it survived two rounds of trying to fix
    // that number everywhere else.
    halation: 0.032, halationTint: [1.0, 0.94, 0.90],
    // WAS 0.0028 — the highest in the file, deliberately, as part of this preset's
    // "photograph of a dark room" character. It is also why `light.dark`'s streaks were the
    // most saturated of the three. See the streak-glitch note above the GRADES table: the
    // character survives on grain + halation + a low bloom threshold; the artifact does not.
    ca: 0.0,
    vignette: 0.32, vignetteRound: 0.88,
    // CONTRAST MUST BE 1.0 HERE, and this is arithmetic, not taste. The grade applies
    // contrast about 0.5 AFTER the lift: c -> (c - 0.5) * k + 0.5. At k = 1.06 any value
    // below 0.0142 comes out NEGATIVE and clamps to black, so a lift of 0.0115 was being
    // deleted by the very next line and the bottom three deciles measured exactly 0.000.
    // Every other view in this set can afford k > 1 because its content sits well above
    // that threshold; this is the one view whose subject lives underneath it.
    contrast: 1.00, saturation: 1.02,
    lift: [0.0330, 0.0315, 0.0295],
    // gain was [1.02, 1.00, 0.97] — a 5% r-over-b tilt applied to the WHOLE curve, which the
    // top decile pays for at full strength. Neutral; the warmth belongs in the shadow tint.
    gain: [1.005, 1.00, 0.995],
    toeCrush: 0.0,
    haze: 0.020, hazeColor: [0.040, 0.040, 0.046],
    shadowTint: [1.02, 0.98, 0.92], highlightTint: [1.02, 1.00, 0.98],
    splitBalance: 0.55,
    aoIntensity: 1.45, aoRadius: 0.60,
    grain: 0.038, grainSize: 1.5,
  },
  // The shaft view is graded to protect the beam: threshold high so only the beam core and
  // the glass blow, halation present so the coloured light bleeds the way film does.
  //
  // ROUND 4, and it inherits the whole diagnosis from `study` above. The values it had were
  // written for a room whose walls were the same near-black the study's were, and they made
  // the same three mistakes: exposure 1.02 (a stop and a half under study's), a 0.62
  // vignette that crushed the corners the beam is supposed to be seen against, and a
  // halationTint of [1.0, 0.46, 0.20] — a saturated orange bleed painted around every bright
  // edge in frame. Measured on the first real capture: median L 3.0, 48% of pixels at zero,
  // top-decile (r-b)/L 0.299 against a 0.20 fail line. A beam only reads as bright if there
  // is a room around it to be brighter THAN, and there was no room.
  //
  // The one number that stays high is `bloomThreshold`: the beam core and the glass are
  // meant to be the only things that bloom, and this is the piece where that matters most.
  // ROUND 4, and both moves are answers to `critic-estate-2` measuring this preset rather
  // than to taste.
  //
  // MEDIAN. The builder claimed 42.8; the critic re-measured twice and got 30.3, barely
  // inside the 30-60 floor. 30.3 is the number to design against — an unsourced claim that
  // does not reproduce is not evidence — so the mid-tone comes up two ways at once, because
  // exposure alone would have to move ~30% and that would put the beam core into the
  // shoulder. `haze` is the cheap half: it mixes every distant pixel toward `hazeColor`
  // BEFORE the tonemap, so it lifts exactly the dark mid-field that is dragging the median
  // down and does almost nothing to the beam, which is near.
  //
  // CHROMA. Measured 0.164 against 0.14, up from 0.105 on the previous build. `halationTint`
  // at [1.0, 0.76, 0.58] was the most saturated in this file — a multiplier applied to the
  // brightest pixels, which is precisely and only the population `grade.mjs` samples for the
  // top-decile (r-b)/L. The identical correction fixed `dark` (0.572 -> 0.161) and
  // `chandelier` (0.779 -> 0.154) in earlier rounds; this preset never received it. The
  // stained glass loses most of its saturation in the same round (see the roundel note in
  // materials-local.js), and that pool is the other half of this frame's top decile.
  shaft: {
    exposure: 1.52,
    ca: 0.0,                    // see the streak-glitch note above the GRADES table
    bloomStrength: 0.080, bloomThreshold: 1.18, bloomRadius: 1.1,
    halation: 0.046, halationTint: [1.0, 0.92, 0.86],
    vignette: 0.26, vignetteRound: 0.90,
    contrast: 1.05, saturation: 1.03,
    lift: [0.013, 0.011, 0.009],
    toeCrush: 0.005,
    haze: 0.033, hazeColor: [0.066, 0.060, 0.052],
    shadowTint: [1.05, 0.96, 0.84], highlightTint: [1.015, 1.00, 0.985],
    splitBalance: 0.60,
    aoIntensity: 1.30, aoRadius: 0.70,
    grain: 0.028,
  },
  // The chandelier is a hero prop on a dark ground: everything is in service of the
  // crystal, so bloom is generous and the vignette is tight.
  // ROUND 4, same diagnosis as `study` and `shaft`. Measured on the round-1 capture: median
  // L 3.2, 43% of pixels at zero, top-decile (r-b)/L **0.779** — the worst chroma on the
  // board. A 0.74 vignette on a frame that dark is most of the black, and a saturated
  // highlightTint on a scene whose only light IS candlelight compounds warm on warm with
  // nothing left to measure it against. Bloom stays generous — this is the one piece where
  // the sparkle is the subject and the crystal is meant to blow.
  // ROUND 5 -> 6. The round-4 fix was verified to have worked and then to have over-shot, in
  // the same verdict: "the black-wall hard-reject cue is verified gone, 0.0% of pixels at
  // L<=2.6" (the win) and "darkest-decile mean L is 17.9 against a 2-8 target — there is no
  // true black anywhere in the frame now, which is the opposite failure" (the hate), with the
  // median at 63.2 just over the washed-out edge of the 30-60 band.
  //
  // Both numbers are the same fact: the room has no unlit part. That is not something a toe
  // curve can invent — crushing 17.9 to 5 would only re-delete the information round 4 spent
  // itself restoring — so most of the correction is upstream, in the view: the ambient comes
  // down from 3.4 to 2.4 and the boiserie's env response from 1.9 to 1.15, which lets the
  // walls fall away from the fixture instead of glowing with it. Here, exposure carries the
  // median (a ratio like chroma does not move, and this piece's chroma is close) and the
  // lift comes off the floor of the range, which is what a lift IS: a pedestal under black.
  chandelier: {
    exposure: 1.08,
    ca: 0.0,                    // see the streak-glitch note above the GRADES table
    bloomStrength: 0.105, bloomThreshold: 0.95, bloomRadius: 1.2,
    // ROUND 5: the halation TINT is a direct contributor to the number this piece keeps
    // failing. Halation multiplies the brightest pixels — exactly the top decile the chroma
    // gate reads — and at [1.0, 0.74, 0.56] it was pushing (r-b)/L up by roughly 0.05 on its
    // own, on a metric whose whole budget is 0.14. Warm, but not a filter.
    halation: 0.045, halationTint: [1.0, 0.88, 0.78],
    vignette: 0.30, vignetteRound: 0.88,
    contrast: 1.06, saturation: 1.02,
    lift: [0.003, 0.0025, 0.002],
    // 0.015: the darkest decile came back at 9.8 against a 2-8 target — the ambient drop did
    // most of the 17.9 -> 9.8 and the last step is small enough that a toe can honestly carry
    // it. Exposure deliberately does NOT move again: the median is 40.4, comfortably mid-band,
    // and darkening the whole curve is what pushed chroma to 0.199 in the first place.
    toeCrush: 0.015,
    haze: 0.012, hazeColor: [0.044, 0.040, 0.036],
    shadowTint: [1.04, 0.97, 0.86], highlightTint: [1.02, 1.00, 0.98],
    splitBalance: 0.58,
    aoIntensity: 1.30, aoRadius: 0.55,
    grain: 0.026,
  },
};
