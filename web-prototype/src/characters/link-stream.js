import * as THREE from 'three';
import { CAPTION_LAYER, captionAdded, captionRemoved } from '../core/caption-layer.js';
import { tagDistK } from './chest-nameplate.js';

/* =============================================================================================
 * 🟢 THE LINK STREAM — Matrix glyphs running between the name tags of a paired couple.
 *
 * John, on the pairing mechanic: *"an animation of them becoming connected and sharing data
 * while their names are merged together."* Until now the entire visual for the biggest social
 * moment in the night was a colour swap on two plates — a change most of the room misses,
 * because nobody is looking at a plate they have already read. Data physically crossing the
 * ballroom between two heads is a thing you cannot miss, and it is the thing the mechanic IS.
 *
 * ⚠️ **IT DRAWS THE CHANNEL, NEVER THE TRAFFIC.** The stream is tied to the PAIR — it starts on
 * the merge, runs flat for the whole 90 seconds, and dies when they part. It is deliberately
 * indifferent to whether anyone is typing.
 *
 * A surge on each whisper was designed and NOT built (`docs/design/link-stream/`), for two
 * reasons, and the second is the real one:
 *   1. it would air WHEN a message was sent, so the room could time a pulse against a face and
 *      learn something the words were meant to hide; and
 *   2. it would need the fact of a send to reach the television at all, and right now it cannot.
 *      `applyWhisper` pushes to exactly two sockets, `t:'whisper'` is absent from `FANOUT_KEYS`,
 *      and `fanoutViolations` REFUSES the word rather than filtering it. Building the surge means
 *      opening that door. That is John's call to make, not a rendering detail to slip in.
 *
 * ⚠️ **CAPTION LAYER, NOT THE WORLD.** Same layer and the same reason as the name tags: the post
 * grade's distance haze reads the depth BEHIND a `depthWrite:false` sprite, so a stream drawn
 * inside the grade would be eaten by the fog of whatever room lay behind it — the exact defect
 * John caught on the tags ("the lack of lighting in the other room is occluding the name tag").
 * `captionAdded` / `captionRemoved` keep `Pipeline`'s overlay-pass counter honest, so the
 * survival game — which has no captions at all — still pays nothing.
 * ============================================================================================= */

/** Katakana and digits, the way the film did it. Painted white; the material tints them. */
const GLYPHS = ['ｱ', 'ﾂ', 'ﾉ', 'ﾑ', 'ｷ', 'ﾜ', 'ﾖ', 'ﾈ', 'ﾊ', 'ﾃ', '7', '3', '4', '9'];
/**
 * One cell of the strip, in pixels.
 *
 * 🚨 **128, NOT 64, AND THE CORONA IS THE REASON.** A 30 px shadow around a glyph drawn in a
 * 64 px cell bleeds straight into its neighbours on the strip, and every sprite then carries a
 * ghost of the two characters beside it. The cell has to hold the widest blur in `paintStrip`
 * with room to spare. `GLYPH_SIZE` is scaled to match, so the CHARACTER is the same size on
 * screen — it is the transparent glow around it that got bigger.
 */
const CELL = 128;

/**
 * 🎨 THE TWO GREENS, both drawn — `docs/design/link-stream/`.
 *
 * John picked `matrix`: the classic, and the only bright cold colour in a show lit entirely in
 * broadcast amber, which is exactly what makes it impossible to miss from a sofa. `pair` is the
 * softer alternative kept alive beside it — the exact green already on the merged plate, so the
 * whole mechanic would be one colour. Swapping is one word.
 */
export const STREAM_LOOKS = {
  matrix: { core: 0x00ff41, tail: 0x00c94f, lead: 0xffffff },
  pair: { core: 0x8fd9a8, tail: 0x3e8f63, lead: 0xffffff },
};
export const STREAM_LOOK = 'matrix';

/** Glyphs in flight per stream. Two pairs max (`MAX_PAIRS`), so this is the whole budget. */
export const STREAM_PARTICLES = 26;
/** Trips along the line per second. Slow enough to read as glyphs rather than as a smear. */
export const STREAM_SPEED = 0.42;
/** Seconds a single glyph holds its character before it flips to another. */
export const GLYPH_HOLD = 0.09;
/** How far off the straight line a glyph may wander, in metres. */
export const STREAM_JITTER = 0.075;
/** Metres, and this is the SPRITE not the character — most of it is transparent corona. See CELL. */
export const GLYPH_SIZE = 0.30;
/**
 * 🪡 THE STRING — the faint thread the glyphs run along.
 *
 * The design canvas had it from the first sketch and the first build shipped without it, so the
 * stream read as loose glyphs floating near two heads rather than as a LINE between two people.
 * John, looking at the shot: *"it should have a matrix green glow and a faint string."* He is
 * right, and it is the cheaper half of the picture: one additive line, 32 segments, following the
 * exact same sagged path the glyphs do.
 */
export const STRING_OPACITY = 0.5;
export const STRING_SEGMENTS = 32;
/**
 * 🪢 How far the middle of the line hangs below the two plates, in metres.
 *
 * Not decoration. A dead-straight line between two head tags runs at exactly head-tag height,
 * which is where every OTHER seated robot keeps its name plate — so the stream cut straight
 * through a bystander tag in the first shot of it, and the picture read as clutter rather than as
 * a connection. A sag drops it into the empty band between the heads and the rug, and it is also
 * simply what a cable does.
 */
export const STREAM_SAG = 0.14;
/** Seconds the stream takes to grow in. Matches `MERGE_POP_MS` so both land as one event. */
export const STREAM_BORN_S = 0.9;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * 🚨 **ONE STRIP, NOT FOURTEEN TEXTURES — AND THIS IS A PERFORMANCE DECISION, NOT A TIDY-UP.**
 *
 * The obvious build gives every glyph its own `CanvasTexture` and swaps `material.map` when the
 * character changes. That needs `material.needsUpdate = true` on every swap, which asks three for
 * a program rebuild — at 18 glyphs a stream, two streams and a flip every 90 ms, roughly four
 * hundred shader recompiles a second, in the beat where the television is already rendering a
 * baked mansion. It is the kind of cost that gets a feature reverted rather than fixed.
 *
 * So the characters live side by side in ONE canvas and each sprite gets a `clone()` of that
 * texture. Clones share the `source`, so the image is uploaded to the GPU exactly once; picking a
 * character is `offset.x`, a uniform, which costs nothing and needs no rebuild.
 */
function paintStrip() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = CELL * GLYPHS.length;
  c.height = CELL;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = '800 64px ui-monospace, Menlo, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  /*
   * 🔦 **THE HALO IS WHY IT READS FROM A SOFA, AND IT HAS TO BE BAKED IN.**
   *
   * The first build painted a flat glyph and the stream came out as a thin dotted line, lost
   * against a lit ballroom — technically correct, and it sold nothing, which was the whole point
   * of the feature. John, on the second: *"it should have a matrix green glow… I can't see it."*
   *
   * ⚠️ **THE BLOOM PASS CANNOT HELP HERE.** Captions are drawn AFTER the grade (see the header),
   * so nothing in the post stack ever sees these sprites. A glow on a caption is painted into its
   * texture or it does not exist. Three passes — a wide dim corona, a tight bright halo, then the
   * solid core — so the character stays crisp instead of dissolving into its own light.
   */
  const PASSES = [
    { blur: 30, alpha: 0.55 },
    { blur: 12, alpha: 0.9 },
    { blur: 0, alpha: 1 },
  ];
  for (const pass of PASSES) {
    g.shadowColor = pass.blur ? '#ffffff' : 'transparent';
    g.shadowBlur = pass.blur;
    g.globalAlpha = pass.alpha;
    for (let i = 0; i < GLYPHS.length; i++) {
      g.fillText(GLYPHS[i], i * CELL + CELL / 2, CELL / 2 + 2);
    }
  }
  g.shadowBlur = 0;
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * The leading glyph is near-white and the tail falls away behind it. Without this the line is a
 * band of noise; with it the eye reads a DIRECTION, which is the whole point — data is going
 * from someone to someone.
 */
export function fadeAt(t) {
  if (t < 0.06) return Math.max(0, t / 0.06);
  if (t > 0.9) return Math.max(0, (1 - t) / 0.1);
  return 0.62 + 0.38 * (1 - t);
}

/**
 * Where a glyph sits along the line, as a 0..1 fraction, while the stream is still growing in.
 *
 * The stream GROWS OUT of the two plates rather than switching on, so the eye is pulled to the
 * two people it belongs to at the moment the merge pop fires. A backward glyph reaches out of B,
 * a forward one out of A — hence the anchor rather than a single origin.
 */
export function reachAt(u, back, born) {
  const anchor = back ? 1 : 0;
  return anchor + (u - anchor) * Math.max(0, Math.min(born, 1));
}

/**
 * 🪢 How far the line hangs below the straight run between the two plates, at fraction `u`.
 *
 * ⚠️ **ONE FUNCTION, USED BY BOTH THE STRING AND THE GLYPHS.** They are meant to look like one
 * object — beads on a thread. Two copies of this curve would drift apart the first time the sag
 * is tuned, and the glyphs would float off the string in a way nobody would think to test for.
 */
export function sagAt(u) {
  return Math.sin(Math.PI * Math.max(0, Math.min(u, 1))) * STREAM_SAG;
}

/**
 * @param {THREE.Object3D} parent  the scene root the streams hang off
 * @param {string} lookName        a key of `STREAM_LOOKS`
 */
export function buildLinkStream(parent, lookName = STREAM_LOOK) {
  const look = STREAM_LOOKS[lookName] || STREAM_LOOKS[STREAM_LOOK];
  const strip = paintStrip();
  const live = new Map();          // "idA|idB" -> stream

  function makeStream(tagA, tagB) {
    const group = new THREE.Group();
    const parts = [];

    /*
     * 🪡 The string. A plain `Line` is one pixel wide on every platform, which is exactly what a
     * FAINT string should be — and additive green on a dark ballroom makes that one pixel glow
     * rather than look like a hairline. It is added first so the glyphs blend on top of it.
     */
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((STRING_SEGMENTS + 1) * 3), 3));
    const stringMat = new THREE.LineBasicMaterial({
      color: look.core,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const string = new THREE.Line(geo, stringMat);
    string.frustumCulled = false;          // its vertices are rewritten every frame
    string.layers.set(CAPTION_LAYER);
    captionAdded();
    group.add(string);

    for (let i = 0; i < STREAM_PARTICLES; i++) {
      const map = strip ? strip.clone() : null;
      if (map) {
        map.needsUpdate = true;
        map.repeat.set(1 / GLYPHS.length, 1);
        map.offset.set((i % GLYPHS.length) / GLYPHS.length, 0);
      }
      const mat = new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      // Every fifth glyph is the bright head of a run; the rest alternate core and tail.
      const lead = i % 5 === 0;
      mat.color.setHex(lead ? look.lead : (i % 2 ? look.core : look.tail));
      const sp = new THREE.Sprite(mat);
      sp.layers.set(CAPTION_LAYER);
      captionAdded();
      group.add(sp);
      parts.push({
        sp,
        mat,
        map,
        lead,
        // Deterministic spread, so a stream never opens with every glyph stacked on one end.
        t: i / STREAM_PARTICLES,
        speed: STREAM_SPEED * (0.72 + (((i * 37) % 11) / 11) * 0.62),
        back: i % 2 === 1,                        // half the glyphs run the other way
        offSide: ((i * 53) % 17) / 17 - 0.5,
        offUp: ((i * 29) % 13) / 13 - 0.5,
        step: 1 + ((i * 5) % (GLYPHS.length - 1)),  // never 0, or the glyph would never change
        hold: (((i * 7) % 9) / 9) * GLYPH_HOLD,
        glyph: i % GLYPHS.length,
      });
    }
    parent.add(group);
    return { group, parts, string, stringMat, tagA, tagB, age: 0 };
  }

  function killStream(s) {
    for (const p of s.parts) {
      p.map?.dispose?.();
      p.mat.dispose();
      captionRemoved();
    }
    // The string is a caption too, and it was counted when it was made.
    s.string?.geometry?.dispose?.();
    s.stringMat?.dispose?.();
    if (s.string) captionRemoved();
    s.group.removeFromParent();
  }

  return {
    /**
     * @param {Array<{a:string,b:string}>} pairs  the public pair rows, straight off the cue
     * @param {(id:string)=>THREE.Object3D|null} tagFor  a player's head tag sprite
     *
     * ⚠️ **IDEMPOTENT.** The pair cue repeats on every links fanout, which is every tap. A stream
     * is keyed on its two ids so a repeat re-uses the one already flying rather than tearing it
     * down and rebuilding it — which would restart the grow-in several times a second and make
     * the whole thing strobe.
     */
    sync(pairs, tagFor) {
      const want = new Map();
      for (const p of pairs || []) {
        if (!p || p.a == null || p.b == null) continue;
        const ta = tagFor(String(p.a));
        const tb = tagFor(String(p.b));
        if (!ta || !tb || ta === tb) continue;
        want.set([String(p.a), String(p.b)].sort().join('|'), [ta, tb]);
      }
      for (const [key, s] of live) {
        if (!want.has(key)) { killStream(s); live.delete(key); }
      }
      for (const [key, ends] of want) {
        if (!live.has(key)) live.set(key, makeStream(ends[0], ends[1]));
      }
    },

    /** Called from the intro bed's step, on every frame the ballroom is on screen. */
    step(dt, camera) {
      if (!live.size || !camera) return;
      const d = Math.max(0, Math.min(dt || 0, 0.1));
      for (const s of live.values()) {
        s.age += d;
        const born = Math.min(1, s.age / STREAM_BORN_S);
        s.tagA.getWorldPosition(_a);
        s.tagB.getWorldPosition(_b);
        _dir.subVectors(_b, _a);
        const span = _dir.length();
        if (span < 0.001) continue;
        _dir.divideScalar(span);
        _side.crossVectors(_dir, UP).normalize();

        /*
         * 🪡 The string, redrawn along the same sagged path. It grows out from BOTH ends at once
         * while `born` climbs, which is what makes the merge read as two people reaching for each
         * other rather than as a graphic switching on.
         */
        if (s.string) {
          const pos = s.string.geometry.attributes.position;
          for (let i = 0; i <= STRING_SEGMENTS; i++) {
            const f = i / STRING_SEGMENTS;
            // Squeeze the whole run toward the middle by `born`, so both ends reach inward.
            const u = 0.5 + (f - 0.5) * Math.min(1, born);
            pos.setXYZ(
              i,
              _a.x + _dir.x * span * u,
              _a.y + _dir.y * span * u - sagAt(u),
              _a.z + _dir.z * span * u,
            );
          }
          pos.needsUpdate = true;
          s.stringMat.opacity = STRING_OPACITY * born;
        }

        for (const p of s.parts) {
          p.t += p.speed * d;
          if (p.t > 1) p.t -= 1;
          const u = reachAt(p.back ? 1 - p.t : p.t, p.back, born);

          // Written component-wise on purpose: this runs dozens of times a frame and a Vector3
          // clone per particle per frame is thousands of allocations a second for nothing.
          p.sp.position.set(
            _a.x + _dir.x * span * u + _side.x * p.offSide * STREAM_JITTER * 2,
            _a.y + _dir.y * span * u + p.offUp * STREAM_JITTER - sagAt(u),
            _a.z + _dir.z * span * u + _side.z * p.offSide * STREAM_JITTER * 2,
          );

          const k = tagDistK(p.sp.position, camera);
          const size = GLYPH_SIZE * k * (p.lead ? 1.15 : 1);
          p.sp.scale.set(size, size, 1);
          p.mat.opacity = fadeAt(p.t) * born;

          p.hold -= d;
          if (p.hold <= 0) {
            p.hold = GLYPH_HOLD;
            p.glyph = (p.glyph + p.step) % GLYPHS.length;
            // `offset` is a uniform — no `needsUpdate`, no program rebuild. See `paintStrip`.
            p.map?.offset.set(p.glyph / GLYPHS.length, 0);
          }
        }
      }
    },

    /** How many streams are flying. The gate and the play harness read this. */
    count() { return live.size; },

    /** Every sprite currently in flight — the harness measures colour and position off these. */
    report() {
      return [...live.entries()].map(([key, s]) => ({
        key,
        age: s.age,
        particles: s.parts.length,
        lit: s.parts.filter((p) => p.mat.opacity > 0.01).length,
      }));
    },

    dispose() {
      for (const s of live.values()) killStream(s);
      live.clear();
      strip?.dispose?.();
    },
  };
}
