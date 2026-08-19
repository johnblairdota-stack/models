import * as THREE from 'three';
import { baker } from '../baker.js';

/**
 * Architectural silk damask wallpaper, three colourways.
 *
 * Worked from `refs/_sheets/hitman.png` and `refs/hitman/hm-museum-interior-h3.jpg` — the
 * Palais de Walewska salons, where the wall above the dado is a deep-ground damask with a
 * gold repeat, framed by gilt mouldings. That photograph is also the reason the ground
 * colours below run darker/richer than a first guess: at room distance under warm practical
 * light a pale damask reads as flat and modern, and the estate is neither.
 *
 * This file starts from `wallstages.js`'s WALLPAPER_SURFACE (destruction stage 0) and keeps
 * its central insight: **the motif is a sheen difference, not a colour difference.** Real
 * silk damask is one cloth, woven with the pattern threads running the other way, so the
 * motif catches light differently rather than being painted on. Albedo moves only a little;
 * roughness inverts. The technique is carried across by hand, not imported — that file is
 * owned by the destruction system and must not gain a dependant here. What is different for
 * an architectural (non-destructible) surface:
 *
 *   - TWO interlocking motif scales instead of one. A large ~60cm ogee trellis carries a
 *     bold pomegranate cartouche inside each frame; a second, smaller palmette fills the
 *     interstice where four neighbouring frames meet. Real damasks almost always layer a
 *     grand repeat over a finer filler — a single-scale motif is the giveaway of a cheap
 *     print.
 *   - THREE colourways, each a ground colour plus a sheen delta (see COLOURWAYS below) —
 *     never two unrelated colours, or it stops reading as one cloth.
 *   - AGE that obeys gravity and geometry: sun fade high on the wall and toward the window
 *     side, water staining rising from the skirting with a hard tide line, lifted seams
 *     that curl, and grime at chair-rail height where hands and furniture touch.
 *
 * fbmT sums octaves, so its output is a narrow bell around 0.5 and a smoothstep gate written
 * directly over it (as in `smoothstep(0.9, 0.99, fbmT(...))`) essentially never fires — four
 * files on this project have shipped authored detail that silently never drew because of
 * exactly this. pat() stretches the distribution about its midpoint first so a threshold
 * means what it looks like it means.
 */

const COLOURWAYS = {
  // The Hitman salon reading: deep sanguine red ground, gold-sheen motif.
  sanguine: { ground: [0.353, 0.071, 0.125], sheen: [0.788, 0.604, 0.294], sheenAmt: 0.50 },
  // Quieter rooms: muted green-grey ground, silver-sheen motif.
  sage: { ground: [0.369, 0.420, 0.345], sheen: [0.725, 0.753, 0.698], sheenAmt: 0.38 },
  // Corridors and the study: pale warm grey, tone-on-tone.
  oyster: { ground: [0.655, 0.612, 0.541], sheen: [0.769, 0.725, 0.651], sheenAmt: 0.28 },
};

const DAMASK_SURFACE = /* glsl */ `
uniform vec3  uGround;
uniform vec3  uMotif;
uniform float uRepeatX;
uniform float uRepeatY;
uniform float uFade;
uniform float uWindowSide;   // -1..1: which side the windows are, biases the sun fade
uniform float uDamp;
uniform float uGrime;
uniform float uChairRailY;   // 0..1 up the tile: where hands and furniture touch

// fbmT is a narrow bell around 0.5, not a flat 0..1 — see file header. Stretch first.
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

// ---- LARGE SCALE (~60cm on a real wall): the ogee trellis -----------------------------
// Two sweeping arcs meeting at the top and bottom of the cell — the lattice every classic
// damask repeat is built from.
float ogeeFrame(vec2 p){
  p.x = abs(p.x);
  float arc = abs(length(p - vec2(0.30, 0.0)) - 0.34) - 0.026;
  return clamp((1.0 - smoothstep(0.0, 0.018, arc)) * (1.0 - smoothstep(0.37, 0.50, abs(p.y))), 0.0, 1.0);
}

// The bold cartouche sitting inside the ogee: a pomegranate/palmette, mirrored, because a
// damask motif is always bilaterally symmetric — noise cannot fake that, so it is drawn.
float pomegranate(vec2 p){
  p.x = abs(p.x);
  float m = 1.0 - smoothstep(0.0, 0.026, sdEllipse(p - vec2(0.0, 0.02), vec2(0.100, 0.160)));
  for (int i = 0; i < 3; i++){
    float a = 0.42 + float(i) * 0.40;
    vec2 c = vec2(sin(a) * 0.175, cos(a) * 0.175 + 0.02);
    m = max(m, 1.0 - smoothstep(0.0, 0.022, sdEllipse(p - c, vec2(0.046, 0.092))));
  }
  float t1 = sdSeg(p, vec2(0.05, 0.23), vec2(0.17, 0.35)) - 0.014;
  float t2 = sdSeg(p, vec2(0.045, -0.21), vec2(0.16, -0.34)) - 0.014;
  m = max(m, 1.0 - smoothstep(0.0, 0.015, min(t1, t2)));
  return clamp(m, 0.0, 1.0);
}

// ---- SMALL SCALE: a lighter palmette filling the interstice between four large ogees --
// A genuinely different, smaller motif rather than a repeat of the first, so the two
// scales interlock instead of just nesting.
float palmette(vec2 p){
  p.x = abs(p.x);
  float m = 1.0 - smoothstep(0.0, 0.016, sdEllipse(p, vec2(0.052, 0.088)));
  for (int i = 0; i < 2; i++){
    float a = 0.60 + float(i) * 0.62;
    vec2 c = vec2(sin(a) * 0.075, cos(a) * 0.075);
    m = max(m, 1.0 - smoothstep(0.0, 0.013, sdEllipse(p - c, vec2(0.026, 0.058))));
  }
  return clamp(m, 0.0, 1.0);
}

void surface(in vec2 uv, inout Surf s){
  // LARGE GRID — half-drop: alternate columns shift by half a tile, as paper is actually
  // hung. This is what breaks the grid read; a straight repeat is the giveaway of a fake.
  vec2 gL = uv * vec2(uRepeatX, uRepeatY);
  float colL = floor(gL.x);
  gL.y += mod(colL, 2.0) * 0.5;
  vec2 cellL = fract(gL) - 0.5;
  float frame = ogeeFrame(cellL);
  float pom   = pomegranate(cellL);
  float large = max(frame, pom * 0.92);

  // SMALL GRID — offset half a cell in both axes so it lands in the interstice where four
  // large frames would meet, with its own half-drop so it never lines up into a grid either.
  vec2 gS = uv * vec2(uRepeatX, uRepeatY) + vec2(0.5, 0.5);
  float colS = floor(gS.x);
  gS.y += mod(colS, 2.0) * 0.5;
  vec2 cellS = fract(gS) - 0.5;
  float small = palmette(cellS) * 0.70;

  float m = clamp(max(large, small), 0.0, 1.0);

  // SILK STRUCTURE at the 20cm-crop scale: fine vertical warp threads, a coarser weft
  // crossing them. Amplitude stays tiny in height — this is a sheen texture, not a relief.
  float warpTh = fbmT(uv * vec2(620.0, 6.0), 1024.0, 2, 2.0, 0.5);
  float weft   = fbmT(uv * vec2(6.0, 380.0), 512.0, 2, 2.0, 0.5);
  float broad  = fbmT(uv * 3.2 + 4.0, 64.0, 4, 2.0, 0.55);

  // Silk reads as silk because the motif is a SHEEN difference, not a colour difference:
  // the pattern is woven with the threads running the other way, so it catches light
  // differently rather than being painted a different colour. uMotif is a sheen-shifted
  // variant of uGround (see COLOURWAYS in wallpaper.js), never an unrelated hue.
  vec3 col = mix(uGround, uMotif, m * 0.40);
  col *= 0.965 + broad * 0.065 + warpTh * 0.020;

  // ---- AGE, obeying gravity and geometry ------------------------------------------------
  // Sun fade: strongest high on the wall AND on whichever side the windows are.
  float fade = smoothstep(0.12, 1.0, uv.y) * uFade * clamp(1.0 + uv.x * uWindowSide * 0.4, 0.5, 1.4);
  // desaturate and lift toward the ground colour — never just brighten toward white
  vec3 desat = mix(col, vec3(luma(col)), fade * 0.50);
  col = mix(desat, uGround * 1.08, fade * 0.42);

  // Water staining rising from the skirting, with a hard tide line where the damp stopped
  // — the detail that sells it.
  float damp = (1.0 - smoothstep(0.0, 0.28, uv.y)) * uDamp;
  damp *= 0.55 + fbmT(uv * vec2(7.0, 3.0) + 19.0, 64.0, 3, 2.0, 0.5) * 0.9;
  float tideY = 0.19 + broad * 0.05;
  float tide = (1.0 - smoothstep(0.0, 0.040, abs(uv.y - tideY))) * uDamp;
  col = mix(col, vec3(0.24, 0.195, 0.150), clamp(damp, 0.0, 1.0) * 0.62);
  col = mix(col, vec3(0.15, 0.120, 0.088), tide * 0.58);

  // Lifted seams, one per repeat width, curling very slightly: a hairline crease with a
  // bright sliver right beside it where the lifted edge catches the light.
  float seamX = fract(uv.x * uRepeatX);
  float seamD = min(seamX, 1.0 - seamX);
  float seamCrease = 1.0 - smoothstep(0.0, 0.006, seamD);
  float seamLift    = (1.0 - smoothstep(0.006, 0.020, seamD)) * smoothstep(0.0, 0.006, seamD);
  col = mix(col, col * 0.55, seamCrease * 0.60);
  col = mix(col, col * 1.30, seamLift * 0.35);

  // Grime at chair-rail height, where furniture and hands touch — a soft horizontal smear
  // gated through pat(), not uniform noise.
  float railBand = 1.0 - smoothstep(0.0, 0.075, abs(uv.y - uChairRailY));
  float smear = fbmT(vec2(uv.x * 9.0, uv.y * 40.0) + 8.0, 64.0, 3, 2.0, 0.5);
  float grime = railBand * smoothstep(0.35, 0.85, pat(smear, 2.6)) * uGrime;
  col = mix(col, vec3(0.12, 0.10, 0.085), grime * 0.30);

  // The two directions carry different roughness, so as the light swings the pattern flips
  // between darker and brighter than its ground rather than staying a fixed lighter shape.
  float sheen = 0.60 - m * 0.26
              + (1.0 - m) * weft * 0.075
              - m * warpTh * 0.050;

  s.albedo    = col;
  s.roughness = clamp(sheen + damp * 0.15 + fade * 0.05 + grime * 0.10
                     - seamLift * 0.10 + seamCrease * 0.08, 0.08, 0.94);
  s.metalness = 0.0;
  s.ao        = clamp(1.0 - damp * 0.10 - seamCrease * 0.30 - grime * 0.12, 0.0, 1.0);
  // Relief stays at thread depth, never at motif-embossing depth: a woven damask has almost
  // no relief, and pushing the motif into the height map makes it read as stamped leather
  // rather than as cloth. All the pattern signal lives in roughness, where it belongs.
  s.height    = 0.5 + m * 0.010 + (warpTh - 0.5) * 0.045 - seamCrease * 0.30 + seamLift * 0.10;
}
`;

/**
 * Silk damask, three colourways. `colourway` selects a ground + sheen-delta preset from
 * COLOURWAYS ('sanguine' | 'sage' | 'oyster'); pass `ground`/`sheen`/`sheenAmt` directly to
 * override. repeatX/repeatY default to a ~60cm motif on a ~2.7m-tall, ~2m-wide wall panel.
 */
export function damask(opts = {}) {
  const cw = COLOURWAYS[opts.colourway ?? 'sanguine'] ?? COLOURWAYS.sanguine;
  const ground = opts.ground ?? cw.ground;
  const sheenCol = opts.sheen ?? cw.sheen;
  const sheenAmt = opts.sheenAmt ?? cw.sheenAmt;
  const motif = opts.motif ?? ground.map((g, i) => g + (sheenCol[i] - g) * sheenAmt);

  const o = {
    ground, motif,
    repeatX: 3.3, repeatY: 4.5,
    fade: 0.5, windowSide: 1.0,
    damp: 0.6, grime: 0.5, chairRailY: 0.33,
    size: 1024, repeat: [1, 1],
    ...opts,
  };
  return baker().standard({
    key: `damask:${JSON.stringify(o)}`,
    size: o.size, surface: DAMASK_SURFACE,
    heightScale: 0.014, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uGround: new THREE.Vector3(...o.ground), uMotif: new THREE.Vector3(...o.motif),
      uRepeatX: o.repeatX, uRepeatY: o.repeatY,
      uFade: o.fade, uWindowSide: o.windowSide,
      uDamp: o.damp, uGrime: o.grime, uChairRailY: o.chairRailY,
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(0.6, 0.6) });
}
