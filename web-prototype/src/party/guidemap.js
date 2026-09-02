/**
 * 🗺️ **THE GUIDE'S MAP — on the guide's phone, and on nothing else.**
 *
 * `docs/slices/task-prime-time-lobby-warm-night.md` §3.7.3. `docs/design/party-loop.md` line 20:
 * *"One is the guide (private phone flyover, adapted from [F]). The TV is not the map."* — and its
 * "Do not" list, first item: *"Put the guide map or hunter path on the TV."*
 *
 * D13 shipped the guide a sentence that said *"The map is yours"* and then no map. This is the
 * map. It is an SVG on a phone, built from the same seeded plan the mansion is built from, so the
 * guide is looking at the house the runner is standing in rather than a diagram of a different
 * one.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS IS A STRING BUILDER AND NOT A CANVAS, A COMPONENT, OR A FLYOVER
 * ---------------------------------------------------------------------------------------------
 * · It must not import THREE. `src/party/mansion.js`'s header has the dependency chain that makes
 *   that a real hazard on a phone; this file inherits that constraint and adds nothing.
 * · It must not be the `[F]` flyover. `[F]` is `room.setLid(false)` over the live scene — a
 *   god-view of the actual house. That is the picture `party-loop.md` refuses to put on the TV,
 *   and putting it on a phone would mean building it, which means one more surface that could
 *   accidentally be mounted somewhere else. A plan drawing cannot be mis-mounted into a god-view.
 * · It carries **no roles and no covers**. It draws rooms, doors, and at most two marks, and the
 *   marks arrive already filtered: `frame.flyover` is `guide`-audience in `net/party/entitle.js`
 *   L81-84, so a good player who is not the guide receives no `flyover` object to pass in here.
 *
 * ⚠️ **NO HEX.** Every colour is a `--night-*` name, for `src/party/palette.js`'s reason and for
 * the reason `party-follow` F8 exists: a reskin that misses one surface leaves one stale surface,
 * and `harness/party-warm.mjs` walks this file's output the same way.
 */

import { planRegions, roomLabel, roomLabelsFor } from './mansion.js';

/** Padding inside the viewBox, in world metres, so a mark on an outer wall is not clipped. */
const PAD = 1.2;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const n2 = (v) => (Math.round(Number(v) * 100) / 100);

/**
 * The wall-normal axis of the door a gate stands in.
 *
 * ⚠️ **LOOKED UP IN `plan.doors`, NEVER GUESSED FROM THE DIRECTION WORD.** A gate's `dir` is which
 * way the guide walks through it; the door's `axis` is which way its wall runs, and the two come
 * apart the moment a room is not a plain rectangle — a door on a north wall reached by walking
 * east is an ordinary shape in a generated house. Guessing would draw a 1.8 m opening across the
 * wall it lives in.
 */
function doorAxisAt(doors, at) {
  const hit = (doors ?? []).find((d) => Math.abs(d.x - at.x) < 1e-6 && Math.abs(d.z - at.z) < 1e-6);
  return hit ? hit.axis : 'x';
}

/**
 * The map, as one `<svg>` string.
 *
 * @param {object} o
 * @param {number|string} o.seed     the plan seed — `pickPlanSeed(worldSeed).seed`
 * @param {object} [o.runner]        `{ x, z }` where the runner is, if the guide may know
 * @param {object} [o.flyover]       `frame.flyover` as delivered: `{ hunter, marks:[{x,z,kind}] }`
 * @param {string} [o.goal]          a room TYPE to ring as the objective, e.g. `'gallery'`
 * @param {boolean} [o.jam]          draw the interference layer — `frame.flyover.jam`
 * @param {object} [o.scope]         GUIDE E. `{ hereId, lit:[ids], gates:[{x,z,dir}], pin }` from
 *                                   `intel-pad.js` `guidePad`. **Omit and this function behaves
 *                                   exactly as it always has** — see the block below.
 */
export function guideMapSvg({ seed, runner, flyover, goal, jam = false, scope = null } = {}) {
  const plan = planRegions(seed);
  const env = plan.env ?? { x0: 0, x1: 1, z0: 0, z1: 1 };
  const x0 = env.x0 - PAD, z0 = env.z0 - PAD;
  const w = (env.x1 - env.x0) + PAD * 2;
  const d = (env.z1 - env.z0) + PAD * 2;

  /*
   * 🌫️ **GUIDE E · "NEIGHBOURS ONLY" — ONE RULE: FOG HIDES.**
   *
   * John locked the board on 2026-09-01. The guide is shown the runner's own room and only the
   * rooms her portals reach right now; everything else is fog. The board's argument is that a pin
   * can then only ever be one doorway ahead, so **the pad cannot hold a route even in principle —
   * there is no second step on it to draw.** `intel-pad.js` `neighbourScope` is where that is
   * enforced by construction; this is only the drawing.
   *
   * ⚠️ **ADDITIVE, AND DELIBERATELY SO.** `scope` defaults to `null` and every branch below is
   * `scoped ? … : <what this file already did>`, so a call without it is byte-identical to the
   * shipped map. That matters because `party-warm` W8–W8i and `party-isolation` I10b are the
   * regression net for this renderer and they call it unscoped — keeping them meaningful was
   * worth more than a tidier rewrite.
   *
   * 🚫 **FOG HIDES MARKS TOO, AND THAT IS THE HUNTER ANSWER.** One rule, no special case: if a
   * position is not inside a lit region it is not drawn. So under Guide E the hunter has no
   * position on the pad at all outside her own rooms, which is *"hunter as warmth not a map"*
   * satisfied by removal rather than by a new field. Rung 5 is a door and it is shut; the warmth
   * strip is its shape, not this slice's.
   *
   * ⚠️ **NO `at`, NO SCOPE — AND THE FALLBACK IS THE PLAN, NOT A BLANK SCREEN.** With no `you`
   * mark there is no "her room" to be a neighbour of. `party-warm` W8c already settled what a
   * blind guide gets: *a floor plan, not an invented mark.* The caller passes `scope: null` and
   * she gets exactly that. Fog is about attention, not secrecy — the plan is built from
   * `worldSeed`, which is audience `all`.
   */
  const scoped = !!scope && Array.isArray(scope.lit) && scope.lit.length > 0;
  const litIds = scoped ? new Set(scope.lit) : null;
  const isLit = (id) => !scoped || litIds.has(id);
  const floor = [...plan.rooms, ...plan.corridors];
  /** Is this world point inside a region the guide can currently see? */
  const litAt = (p) => {
    if (!scoped) return true;
    if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.z))) return false;
    return floor.some((r) => litIds.has(r.id)
      && p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1);
  };

  const body = [];

  for (const r of plan.corridors) {
    body.push(`<rect class="${isLit(r.id) ? 'gm-hall' : 'gm-fog'}${scoped && r.id === scope.hereId ? ' gm-here' : ''}" `
      + `x="${n2(r.x0)}" y="${n2(r.z0)}" `
      + `width="${n2(r.x1 - r.x0)}" height="${n2(r.z1 - r.z0)}"/>`);
  }
  for (const r of plan.rooms) {
    const isGoal = goal && r.type === goal;
    // Under scope the goal ring is held back with everything else. The guide is told the KIND is
    // somewhere past the fog — `missionLine` already says it in words — and ringing a room she
    // cannot see would hand back the whole-house picture the board deliberately takes away.
    const cls = isLit(r.id)
      ? `gm-room${isGoal ? ' gm-goal' : ''}${scoped && r.id === scope.hereId ? ' gm-here' : ''}`
      : 'gm-fog';
    body.push(`<rect class="${cls}" x="${n2(r.x0)}" y="${n2(r.z0)}" `
      + `width="${n2(r.x1 - r.x0)}" height="${n2(r.z1 - r.z0)}"/>`);
  }
  /*
   * 🗣️ THE NAMES COME FROM `roomLabelsFor`, NOT FROM `roomLabel`, AND THAT IS THE FIX.
   * A playcritique pass photographed this map with STUDY printed twice — and the guide's whole
   * job is calling a room out loud. `mansion.js` disambiguates the pair by compass word, and
   * `intel.js` speaks the same map through `spaceLabel`, so what is drawn here is exactly what
   * the phone's own feed says.
   */
  const labels = roomLabelsFor(plan.rooms);
  // Labels last over the fills, and only where the room is wide enough to hold one — a label
  // spilling out of a 3.4 m service passage reads as a bug in the map rather than a tight room.
  for (const r of plan.rooms) {
    if (r.x1 - r.x0 < 5.0) continue;
    if (!isLit(r.id)) continue;                      // fog hides the name with the room
    const cx = n2((r.x0 + r.x1) / 2);
    const cz = (r.z0 + r.z1) / 2;
    /*
     * ⚠️ A DISAMBIGUATED NAME IS STACKED, NOT RUN ON. The 5.0 m guard above was measured against
     * one-word labels; "NORTH STUDY" is half again as wide and would hang out over the wall,
     * which reads as a broken map rather than as a named room. Split on the space and the widest
     * drawn line is still the room type, so the guard keeps meaning what it meant.
     */
    const parts = String(labels.get(r.id) ?? roomLabel(r.type)).split(' ');
    const lines = parts.length > 1 ? [parts[0], parts.slice(1).join(' ')] : parts;
    const dy = lines.length > 1 ? 0.85 : 0;
    body.push(`<text class="gm-label" x="${cx}" y="${n2(cz)}">`
      + lines.map((line, i) => `<tspan x="${cx}" y="${n2(cz - dy + i * dy * 2)}">`
        + `${esc(line)}</tspan>`).join('')
      + '</text>');
  }
  /*
   * 🚪 Under scope the doors drawn are exactly her EXITS — the board draws them "as gates, not as
   * a path", and `scope.gates` is already one-door-deep by construction, so there is no filtering
   * decision to get wrong here. Unscoped, every door in the house, as before.
   */
  const drawnDoors = scoped
    ? (scope.gates ?? []).map((g) => ({ x: g.x, z: g.z, axis: doorAxisAt(plan.doors, g) }))
    : plan.doors;
  for (const dr of drawnDoors) {
    const half = 0.9;
    const [ax, az, bx, bz] = dr.axis === 'x'
      ? [dr.x, dr.z - half, dr.x, dr.z + half]
      : [dr.x - half, dr.z, dr.x + half, dr.z];
    body.push(`<line class="gm-door${scoped ? ' gm-gate' : ''}" `
      + `x1="${n2(ax)}" y1="${n2(az)}" x2="${n2(bx)}" y2="${n2(bz)}"/>`);
  }

  /*
   * 📍 THE PIN. One, ever — D2. It is drawn as a ring ON THE DOOR rather than as an arrow into the
   * far room, because the thing the guide pinned IS the door: *"Take the north door."*
   */
  if (scoped && scope.pin && Number.isFinite(Number(scope.pin.x))) {
    body.push(`<circle class="gm-pin" cx="${n2(scope.pin.x)}" cy="${n2(scope.pin.z)}" r="1.5"/>`);
  }

  /*
   * ⚠️ THE MARKS ARE DRAWN FROM WHAT ARRIVED, NEVER FROM WHAT COULD BE COMPUTED. If `flyover` is
   * absent — because this phone is not the guide, or because no camera is lit yet — the map is a
   * FLOOR PLAN and that is the correct picture. Do not fall back to the runner's own position for
   * the hunter mark to "have something to draw"; a map that invents a mark is worse than a map
   * that admits it is blind, and this one says so in `gm-blind` below.
   */
  for (const m of flyover?.marks ?? []) {
    if (!litAt(m)) continue;
    body.push(`<circle class="gm-mark" cx="${n2(m.x)}" cy="${n2(m.z)}" r="0.9"/>`);
  }
  if (runner && Number.isFinite(Number(runner.x)) && litAt(runner)) {
    body.push(`<circle class="gm-runner" cx="${n2(runner.x)}" cy="${n2(runner.z)}" r="1.15"/>`);
  }
  if (flyover?.hunter && Number.isFinite(Number(flyover.hunter.x)) && litAt(flyover.hunter)) {
    body.push(`<circle class="gm-hunter" cx="${n2(flyover.hunter.x)}" cy="${n2(flyover.hunter.z)}" r="1.3"/>`);
  }

  /*
   * 📡 THE INTERFERENCE IS PART OF THE MAP RATHER THAN A DIV OVER IT, AND THAT IS SO IT SCALES
   * WITH THE HOUSE. The map's viewBox is in METRES and `preserveAspectRatio` letterboxes it, so
   * an absolutely-positioned overlay would sit over the letterbox as well as the plan and would
   * need the phone to measure the rendered box. Inside the SVG it is in the same coordinates as
   * the rooms it is eating, for free, at any phone width.
   *
   * ⚠️ IT IS ALWAYS EMITTED AND `.jam` ON THE ROOT IS WHAT SWITCHES IT ON. `patchLive` in
   * `views/party-phone.js` toggles that one class at 2 Hz; re-writing the whole SVG to add and
   * remove a layer would re-lay-out the plan under the guide's thumb twice a second, which is
   * the defect the structural stamp exists to prevent.
   */
  body.push(jamLayer(x0, z0, w, d));

  return `<svg class="guide-map${jam ? ' jam' : ''}" viewBox="${n2(x0)} ${n2(z0)} ${n2(w)} ${n2(d)}" `
    + `preserveAspectRatio="xMidYMid meet" aria-label="The house">${body.join('')}</svg>`;
}

/**
 * 🟥 **THE EVIL ROBOT EATING THE MAP — red matrix rain, in map metres.**
 *
 * John: *"the map feed is interrupted by static and spooky evil-robot effects — prefer red
 * matrix-like symbols eating parts of the map and making it unusable for a stretch."*
 *
 * Three layers, and the middle one is the one that does the work:
 *
 *   `gm-jam-wash`   a full-bleed scrim, so nothing under it is readable at a glance.
 *   `gm-jam-col`    columns of glyphs falling at staggered rates. These are the "eating" — each
 *                   column is opaque and drawn over the plan, so rooms genuinely disappear
 *                   behind them rather than being tinted.
 *   `gm-jam-tear`   two horizontal tears that sweep, which is what reads as a broken FEED rather
 *                   than as a decorative filter.
 *
 * ⚠️ **DETERMINISTIC, FROM THE GEOMETRY, WITH NO `Math.random`.** The map is rebuilt whenever the
 * sheet's shape changes, and a random layout would jump on every rebuild — which is the one thing
 * a guide would read as the map itself being broken rather than the feed.
 */
const JAM_GLYPHS = '01<>/\\|+*#=%$&@';
const JAM_COLS = 14;
const JAM_ROWS = 9;

function jamLayer(x0, z0, w, d) {
  const cw = w / JAM_COLS;
  const out = [`<rect class="gm-jam-wash" x="${n2(x0)}" y="${n2(z0)}" width="${n2(w)}" height="${n2(d)}"/>`];
  for (let c = 0; c < JAM_COLS; c++) {
    // Two coprime-ish strides so the glyph grid does not repeat on a visible period, and a
    // per-column delay so the rain falls rather than blinking in unison.
    const glyphs = Array.from({ length: JAM_ROWS }, (_, r) =>
      JAM_GLYPHS[(c * 5 + r * 3) % JAM_GLYPHS.length]).join('');
    const x = x0 + cw * (c + 0.5);
    const delay = ((c * 7) % 20) / 10;
    const dur = 2.2 + ((c * 3) % 7) * 0.28;
    out.push(`<text class="gm-jam-col" x="${n2(x)}" y="${n2(z0)}" `
      + `style="animation-delay:${delay}s;animation-duration:${dur}s">`
      + Array.from(glyphs, (g, r) =>
        `<tspan x="${n2(x)}" dy="${r === 0 ? n2(d * 0.06) : n2(d / JAM_ROWS)}">${esc(g)}</tspan>`).join('')
      + `</text>`);
  }
  for (const [i, at] of [0.34, 0.68].entries()) {
    out.push(`<rect class="gm-jam-tear" x="${n2(x0)}" y="${n2(z0 + d * at)}" `
      + `width="${n2(w)}" height="${n2(d * 0.055)}" style="animation-delay:${i * 0.9}s"/>`);
  }
  return `<g class="gm-jam">${out.join('')}</g>`;
}

/**
 * The map's own CSS. Held here rather than in `night-skin.js` for `rolecard.js`'s reason: a bare
 * node gate can walk a string and assert it holds no colour of its own, and cannot walk a
 * stylesheet that only exists once a browser has parsed it.
 */
export const GUIDE_MAP_CSS = `
    .guide-map { width:100%; height:auto; max-height:46vh; display:block; margin:10px 0 4px;
      background:var(--night-deep); border:1px solid rgba(var(--night-accent-rgb), .18);
      border-radius:12px; }
    .guide-map .gm-hall { fill:var(--night-well); }
    .guide-map .gm-room { fill:var(--night-panel); stroke:var(--night-dim); stroke-width:.12; }
    .guide-map .gm-goal { stroke:var(--night-accent); stroke-width:.34; }
    .guide-map .gm-door { stroke:var(--night-accent); stroke-width:.34; stroke-linecap:round; }
    .guide-map .gm-label { fill:var(--night-soft); font-size:1.5px; text-anchor:middle;
      dominant-baseline:middle; letter-spacing:.06em; text-transform:uppercase; }
    .guide-map .gm-mark { fill:var(--night-soft); opacity:.55; }
    .guide-map .gm-runner { fill:var(--night-live); }
    .guide-map .gm-hunter { fill:var(--night-bad); }
    .gm-blind { color:var(--night-dim); }

    /* 🌫️ GUIDE E · neighbours only. Fog is drawn rather than left empty, so the guide can see
       that there IS a house out there she cannot see — an empty margin reads as the edge of the
       plan, which is a different and wrong sentence. */
    .guide-map .gm-fog { fill:var(--night-deep); stroke:var(--night-well); stroke-width:.1;
      stroke-dasharray:.5 .7; opacity:.5; }
    .guide-map .gm-here { stroke:var(--night-live); stroke-width:.3; }
    .guide-map .gm-gate { stroke-width:.5; }
    .guide-map .gm-pin { fill:none; stroke:var(--night-accent); stroke-width:.42; }

    /* 📡 The interference. Off unless the root carries .jam, so the layer costs a display
       property rather than a rebuild — see jamLayer's header. */
    .guide-map .gm-jam { display:none; }
    .guide-map.jam .gm-jam { display:block; }
    .guide-map.jam { border-color:var(--night-bad); }
    .guide-map .gm-jam-wash { fill:var(--night-deep); opacity:.82; }
    .guide-map .gm-jam-col { fill:var(--night-bad); font-size:1.9px; text-anchor:middle;
      font-family:ui-monospace, Menlo, monospace; letter-spacing:.04em;
      animation:gm-rain 3s linear infinite; }
    .guide-map .gm-jam-tear { fill:var(--night-bad); opacity:.16;
      animation:gm-tear 2.6s ease-in-out infinite; }
    @keyframes gm-rain {
      0%   { opacity:0; transform:translateY(-6%); }
      18%  { opacity:1; }
      82%  { opacity:1; }
      100% { opacity:0; transform:translateY(6%); }
    }
    @keyframes gm-tear {
      0%,100% { opacity:.06; transform:translateY(-3%); }
      50%     { opacity:.30; transform:translateY(3%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .guide-map .gm-jam-col, .guide-map .gm-jam-tear { animation:none; opacity:1; }
    }`;
