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

import { planRegions, roomLabel } from './mansion.js';

/** Padding inside the viewBox, in world metres, so a mark on an outer wall is not clipped. */
const PAD = 1.2;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const n2 = (v) => (Math.round(Number(v) * 100) / 100);

/**
 * The map, as one `<svg>` string.
 *
 * @param {object} o
 * @param {number|string} o.seed     the plan seed — `pickPlanSeed(worldSeed).seed`
 * @param {object} [o.runner]        `{ x, z }` where the runner is, if the guide may know
 * @param {object} [o.flyover]       `frame.flyover` as delivered: `{ hunter, marks:[{x,z,kind}] }`
 * @param {string} [o.goal]          a room TYPE to ring as the objective, e.g. `'gallery'`
 */
export function guideMapSvg({ seed, runner, flyover, goal } = {}) {
  const plan = planRegions(seed);
  const env = plan.env ?? { x0: 0, x1: 1, z0: 0, z1: 1 };
  const x0 = env.x0 - PAD, z0 = env.z0 - PAD;
  const w = (env.x1 - env.x0) + PAD * 2;
  const d = (env.z1 - env.z0) + PAD * 2;

  const body = [];

  for (const r of plan.corridors) {
    body.push(`<rect class="gm-hall" x="${n2(r.x0)}" y="${n2(r.z0)}" `
      + `width="${n2(r.x1 - r.x0)}" height="${n2(r.z1 - r.z0)}"/>`);
  }
  for (const r of plan.rooms) {
    const isGoal = goal && r.type === goal;
    body.push(`<rect class="gm-room${isGoal ? ' gm-goal' : ''}" x="${n2(r.x0)}" y="${n2(r.z0)}" `
      + `width="${n2(r.x1 - r.x0)}" height="${n2(r.z1 - r.z0)}"/>`);
  }
  // Labels last over the fills, and only where the room is wide enough to hold one — a label
  // spilling out of a 3.4 m service passage reads as a bug in the map rather than a tight room.
  for (const r of plan.rooms) {
    if (r.x1 - r.x0 < 5.0) continue;
    body.push(`<text class="gm-label" x="${n2((r.x0 + r.x1) / 2)}" y="${n2((r.z0 + r.z1) / 2)}">`
      + `${esc(roomLabel(r.type))}</text>`);
  }
  for (const dr of plan.doors) {
    const half = 0.9;
    const [ax, az, bx, bz] = dr.axis === 'x'
      ? [dr.x, dr.z - half, dr.x, dr.z + half]
      : [dr.x - half, dr.z, dr.x + half, dr.z];
    body.push(`<line class="gm-door" x1="${n2(ax)}" y1="${n2(az)}" x2="${n2(bx)}" y2="${n2(bz)}"/>`);
  }

  /*
   * ⚠️ THE MARKS ARE DRAWN FROM WHAT ARRIVED, NEVER FROM WHAT COULD BE COMPUTED. If `flyover` is
   * absent — because this phone is not the guide, or because no camera is lit yet — the map is a
   * FLOOR PLAN and that is the correct picture. Do not fall back to the runner's own position for
   * the hunter mark to "have something to draw"; a map that invents a mark is worse than a map
   * that admits it is blind, and this one says so in `gm-blind` below.
   */
  for (const m of flyover?.marks ?? []) {
    body.push(`<circle class="gm-mark" cx="${n2(m.x)}" cy="${n2(m.z)}" r="0.9"/>`);
  }
  if (runner && Number.isFinite(Number(runner.x))) {
    body.push(`<circle class="gm-runner" cx="${n2(runner.x)}" cy="${n2(runner.z)}" r="1.15"/>`);
  }
  if (flyover?.hunter && Number.isFinite(Number(flyover.hunter.x))) {
    body.push(`<circle class="gm-hunter" cx="${n2(flyover.hunter.x)}" cy="${n2(flyover.hunter.z)}" r="1.3"/>`);
  }

  return `<svg class="guide-map" viewBox="${n2(x0)} ${n2(z0)} ${n2(w)} ${n2(d)}" `
    + `preserveAspectRatio="xMidYMid meet" aria-label="The house">${body.join('')}</svg>`;
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
    .gm-blind { color:var(--night-dim); }`;
