/**
 * app.js — the map designer's front end.
 *
 * 🚨 THE ONE ARCHITECTURAL RULE: THERE IS EXACTLY ONE PACKING ALGORITHM IN THIS PROJECT AND IT IS
 * NOT IN THIS FILE. Everything below renders and edits what `harness/genspike.mjs` produces. When
 * a room is dragged, the moved rectangles go straight back into `planFromRooms()` — the same
 * decomposition, the same boundary graph, the same dig spans, the same `measure()` — so a
 * hand-authored layout and a seeded one are measured by identical code. Two generators that drift
 * apart is the worst outcome available here, so this file owns no geometry the harness could own.
 *
 * What it DOES own: pixels, hit-testing, and the self-check that says whether the pixels are
 * telling the truth (see `verify()` at the bottom — it runs on every frame and it is shown to
 * the user, because a tool that draws a plan wrongly is worse than no tool).
 */

import {
  buildPlan, planFromRooms, measure, toJSON, boundarySegments, flatness, interconnectOn,
  LIBRARY, WALL_T, W_MIN, L_DIG, L_DOOR, DIG_H, AUTHORED_SPANS, SLAB_MAX, IC_W, CONNECTOR_W,
} from '/harness/genspike.mjs';

// ===========================================================================================
// palette — and the two colours that carry meaning
// ===========================================================================================
// ⚠️ ORANGE IS DIGGABLE AND CYAN IS NOT, WHICH IS THE GAME'S OWN LANGUAGE. In `game.play` the
// ornate coat tears off, white shows underneath, and the CYAN structure is indestructible and
// must stay that way. Using cyan for "you can dig here" would teach the exact opposite of what
// the game teaches, so it is used for the hard stops.
//
// 🚨 **AND CYAN USED TO CARRY THREE REFERENTS, WHICH IS THE DEFECT JOHN FOUND WITH HIS EYE.**
// He said, after labelling forty plans: *"I don't understand the cyan parts either because they
// are still on the map when I was made to understand they were inside the orange line."* He was
// right. Cyan meant, all at once: (1) `nodig` — a boundary too short to dig, a hard stop in its
// own right; (2) `ic` — the interconnect, the ONE spot on a wall that is a way THROUGH, i.e. the
// exact opposite; and (3) in the prose, the game's indestructible barrier behind the orange,
// which **is not drawn on this plan at all**. The legend even said the quiet part out loud —
// *"same colour … because it is the same answer — you are not getting through"* — three sentences
// after calling the interconnect the one way through.
//
// The rule now: **on this plan a colour is one thing.** Cyan is the hard stop and nothing else.
// The interconnect is neither diggable coat nor hard stop, so it is neither orange nor cyan.
const C = {
  dig: '#ff9a3c', digDim: '#5c3a1c', digGlow: '#ffc98a',
  nodig: '#3fd0e0', nodigDim: '#17414a',
  /**
   * 🕳️ **THE SOFT SPOT (the interconnect)** — the ONE 1.55 m place per shared wall where there is
   * no barrier behind the coat, so digging it puts you in the next room and switches the barrier
   * off for the whole house.
   *
   * ⚠️ **LIME, AND THE HUE IS THE DECISION.** It is the one free band left on this plan: orange
   * 25° is the diggable coat, amber 40° a breachable door, exit green 141°, cyan 187° the hard
   * stop, slab violet 254°, route violet 275°, hunter magenta 313°, chained red 0°. 82° collides
   * with none of them, and it leans YELLOW rather than green precisely because the mark it is most
   * likely to sit beside on a wall is a green open-door gap. It is also the brightest thing on any
   * wall, which is right: it is the only mark on the plan that is a PRIZE rather than a material.
   * It keeps the existing shape cue too — the lozenge stands 1.5x proud of the wall band, where
   * the cyan hard-stop bar is flush — so the two differ in hue AND in silhouette.
   */
  ic: '#b6ff2e', icRing: '#1b2a05',
  // 🧱 SLAB ARM — one face per wall. Violet so it can be laid over the orange without either
  // colour claiming the other's meaning.
  slab: '#8f7bd6', slabSeam: '#ff6b6b', slabInk: '#cbbcff',
  // ⚠️ MAGENTA, DELIBERATELY NOT RED. The hunter's mark sits a few pixels from the chained door's
  // red cross, and red-meaning-two-things is the exact defect this round exists to fix. Far enough
  // from the route's soft violet (#c98cff) too, which is the only other cool accent on the plan.
  hunter: '#ff4fd8',
  wall: '#39414d', wallSolid: '#525c6b',
  exit: '#67e08a', spawn: '#ffd75e', route: '#c98cff', warn: '#ff6b6b',
  // ⚠️ CORRIDORS ARE DARK IN THE GAME AND MUST NOT BE DARK ON THE PLAN. Drawn at the fiction's
  // own brightness they vanished into the background and the plan lost its circulation entirely,
  // which is the one thing a floor plan has to show. This is the drawing convention, not the lighting.
  corridor: '#2c3542', corridorInk: '#68788c', corridorEdge: '#44526300',
  void: '#0a0b0d', voidInk: '#2c323c',
  env: '#0b0d10', envLine: '#4a5464',
  ink: '#d6dbe2', dim: '#8892a0', faint: '#5d6673',
};
const ROOMC = {
  gallery: '#6f5f47', ballroom: '#635270', study: '#46614f',
  service: '#4e5460', chapel: '#6f5049', custom: '#6b6b4a',
};
const RANKC = ['#2a2e35', '#ff6b6b', '#ffbe4d', '#67e08a'];

// ===========================================================================================
// state
// ===========================================================================================
/**
 * 🚨 **THE ROUTE-HIDDEN ARM (`?arm=blind`, or the `route: shown/HIDDEN` button, or `H`).**
 *
 * `docs/handoff/maplabel-1.md` §3: over John's first 40 labels, the ONLY feature that clears a
 * family-wise shuffle null is `hopsToExit` — regions crossed spawn→exit — at **AUC 0.831**. And
 * `hopsToExit`/`digsToExit` are **the two numbers this tool prints in the largest type**, beside
 * **the most conspicuous overlay on the plan**: a violet dashed line with a box round every wall
 * it breaks. At a median **18.5 s per plan**, *"he has taste for routes"* and *"he read the route
 * off the drawing"* are the same data. **This arm is what separates them**, and it is worth more
 * than the critic that would be built on top.
 *
 * It hides everything that STATES the answer and nothing else:
 *
 *   · the drawn route and its wall boxes (`drawRoute`)          · the legend row for it
 *   · the whole ROUTE block of DIFFICULTY, including the        · the `route` toggle itself, so it
 *     `a run cannot be won in 8 s` verdict, which is                cannot be switched back on by
 *     literally `digs >= 2 || hops >= 3`                            accident mid-session
 *   · the gap-0 table's `digs, spawn → exit` row
 *   · the pocket panel's `can you walk to the way out?` row (that is `digsToExit === 0`)
 *
 * ⚠️ **WHAT DELIBERATELY STAYS, because removing it would test a different question.** The SPAWN
 * and EXIT pips, the yellow zero-dig pocket, and the plan itself. If his eye still counts the
 * rooms between the two pips, **that is the taste hypothesis and it is what we want to measure**;
 * the confound being tested is reading a printed number, not seeing the house. The SHAPE block's
 * `rank depth` also stays — it is the FLAT hypothesis, a different question, and stripping it
 * would confound this arm with that one.
 *
 * The arm lives in the URL and a toggle RELOADS rather than redrawing, so it cannot drift
 * mid-session into a state the label rows do not record.
 */
const ARM = new URLSearchParams(location.search).get('arm');
const ROUTE_HIDDEN = ARM === 'blind' || ARM === 'hidden';
/** what goes in every label row from now on. ⚠️ A row with NO `arm` field is one of the original
 *  40, taken with the route visible — tagged by absence, deliberately, so John's existing data
 *  file is never rewritten. Read it as `row.arm ?? 'route-shown'`. */
const ARM_TAG = ROUTE_HIDDEN ? 'route-hidden' : 'route-shown';

const S = {
  seed: 7,
  dials: { align: 0.35, gap: 2.2, waste: 0.04, cutSpan: 30 },
  DEFAULTS: { align: 0.35, gap: 2.2, waste: 0.04, cutSpan: 30 },
  rooms: null,             // non-null once hand-edited: the editor's own room list
  edit: false,
  sel: -1,
  snap: true,
  view: { s: 8, ox: 0, oz: 0 },
  show: {
    dig: true, panels: true, ic: true, slabs: false, doors: true, labels: true, corridors: true,
    route: !ROUTE_HIDDEN, pocket: true, degree: false, grid: false, sizes: true,
  },
  plan: null, m: null, segs: null, gap0: null, pocket: null,
  drag: null, labels: [],
  /** set by draw(): apertures the renderer had to clamp. MUST stay empty — see verify() V5. */
  clamped: [],
};

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const strip = $('rankstrip'), sctx = strip.getContext('2d');

// ===========================================================================================
// build
// ===========================================================================================

/**
 * 🚨 **THE CONTROL THAT MUST FAIL, AND IT SHIPS RATHER THAN LIVING IN A TRANSCRIPT.**
 *
 * HANDOFF: *"Every assertion ships a control that must FAIL… three instruments on this project
 * shipped green while blind."* Checks V5 and V6 in the VERIFICATION panel say the door-clipping
 * defect is gone. **Open the tool as `…/tools/mapdesigner/?ctl=clip` and this puts it back** — the
 * old rule, exactly: door eligibility decided on the boundary's SUMMED contact rather than on its
 * longest contiguous wall run, and the state stamped on every run of the boundary.
 *
 * V5 and V6 must go RED, and a banner must appear. If they stay green with this on, the checks
 * have stopped being able to see the thing they were written for and their green means nothing.
 * On seed 0 the first-listed run is `r5.chapel|c2` with a CLEAR LENGTH OF 0.00 m carrying an open
 * door — a 2.08 m green rectangle hanging 1.04 m out of each end of a wall that is not there.
 */
const CTL_CLIP = new URLSearchParams(location.search).get('ctl') === 'clip';
function reintroduceTheClipping(segs, p) {
  const byEdge = new Map(p.edges.map((e) => [`${e.ai}|${e.bi}`, e]));
  for (const s of segs) {
    const e = byEdge.get(`${s.ai}|${s.bi}`);
    if (!e) continue;
    const oldCanDoor = !e.solid && e.clear >= L_DOOR;      // the REFUTED rule: summed contact
    s.door = oldCanDoor ? (e.door === 'none' ? 'breachable' : e.door) : 'none';  // on EVERY run
    s.hunterForces = s.door === 'breachable';
  }
}

function rebuild(opts = {}) {
  try {
    if (S.rooms) {
      S.plan = planFromRooms(S.seed, S.rooms, { ...S.dials, normalise: false });
    } else {
      S.plan = buildPlan(S.seed, S.dials);
    }
    S.m = measure(S.plan);
    S.segs = boundarySegments(S.plan);
    if (CTL_CLIP) reintroduceTheClipping(S.segs, S.plan);
    S.pocket = zeroDigPocket(S.plan, S.m);
    if (!opts.light) {
      // the "do corridors cost contact" comparison: the same seed with the warren turned off
      S.gap0 = S.rooms ? null : measure(buildPlan(S.seed, { ...S.dials, gap: 0 }));
    }
    $('status').textContent = '';
  } catch (e) {
    $('status').innerHTML = `<span style="color:${C.warn}">generator threw: ${e.message}</span>`;
    console.error(e);
  }
}

/**
 * 🚨 THE ZERO-DIG POCKET — how much of the house you can walk into without swinging once.
 *
 * `critic-corridor-1` measured it at 18.2% and called it out because it is invisible in every
 * other view: a boundary that is a CHAINED DOOR and a boundary you have to DIG look identical
 * on a plan, and they are completely different gameplay. The pocket is the reachable set over
 * `door === 'open'` edges only, from spawn — everything else costs a swing.
 *
 * A big pocket is a house that opens itself; a tiny one is a house that is a wall from the first
 * second. Neither is automatically right, which is exactly why it needs to be looked at.
 */
function zeroDigPocket(p, m) {
  const n = p.regions.length;
  const adj = Array.from({ length: n }, () => []);
  for (const e of p.edges) if (e.door === 'open') { adj[e.ai].push(e.bi); adj[e.bi].push(e.ai); }
  const seen = new Array(n).fill(false);
  const src = m.spawn;
  if (src >= 0) { const q = [src]; seen[src] = true;
    while (q.length) { const u = q.pop(); for (const v of adj[u]) if (!seen[v]) { seen[v] = true; q.push(v); } } }
  const clearArea = (R) => R.rects.reduce((s, r) => s + Math.max(0, r.x1 - r.x0 - WALL_T) * Math.max(0, r.z1 - r.z0 - WALL_T), 0);
  let inside = 0, total = 0, rooms = 0;
  for (let i = 0; i < n; i++) {
    const R = p.regions[i];
    if (R.kind === 'void') continue;
    const a = clearArea(R);
    total += a;
    if (seen[i]) { inside += a; if (R.kind === 'room') rooms++; }
  }
  return { seen, area: inside, frac: total > 0 ? inside / total : 0, rooms, reachesExit: p.exitIdx >= 0 && seen[p.exitIdx] };
}

/** the editor's room list, derived from whatever plan is on screen */
function roomsFromPlan(p) {
  return p.regions.filter((R) => R.kind === 'room').map((R) => ({
    type: R.type, rot: !!R.rot, storey: R.y1, char: R.char, custom: !!R.custom,
    x0: R.rects[0].x0, x1: R.rects[0].x1, z0: R.rects[0].z0, z1: R.rects[0].z1,
  }));
}

// ===========================================================================================
// view
// ===========================================================================================

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.parentElement.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cv._w = r.width; cv._h = r.height;
  const sr = strip.parentElement.getBoundingClientRect();
  strip.width = Math.max(1, Math.round((sr.width - 28) * dpr));
  strip.height = Math.round(46 * dpr);
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  strip._w = sr.width - 28;
}

function fit() {
  const e = S.plan.env, pad = 46;
  const w = e.x1 - e.x0, d = e.z1 - e.z0;
  S.view.s = Math.min((cv._w - pad * 2) / w, (cv._h - pad * 2) / d);
  S.view.ox = e.x0 - (cv._w / S.view.s - w) / 2;
  S.view.oz = e.z0 - (cv._h / S.view.s - d) / 2;
}
const SX = (x) => (x - S.view.ox) * S.view.s;
const SY = (z) => (z - S.view.oz) * S.view.s;
const WX = (px) => px / S.view.s + S.view.ox;
const WZ = (py) => py / S.view.s + S.view.oz;

// ===========================================================================================
// draw
// ===========================================================================================

function draw() {
  const p = S.plan, m = S.m, v = S.view;
  S.clamped = [];
  ctx.clearRect(0, 0, cv._w, cv._h);
  ctx.fillStyle = '#090a0c'; ctx.fillRect(0, 0, cv._w, cv._h);
  const e = p.env;

  // --- ground / envelope ------------------------------------------------------------------
  ctx.fillStyle = C.env;
  ctx.fillRect(SX(e.x0), SY(e.z0), (e.x1 - e.x0) * v.s, (e.z1 - e.z0) * v.s);

  if (S.show.grid) {
    ctx.strokeStyle = '#141820'; ctx.lineWidth = 1;
    for (let x = Math.ceil(e.x0 / 5) * 5; x < e.x1; x += 5) { ctx.beginPath(); ctx.moveTo(SX(x), SY(e.z0)); ctx.lineTo(SX(x), SY(e.z1)); ctx.stroke(); }
    for (let z = Math.ceil(e.z0 / 5) * 5; z < e.z1; z += 5) { ctx.beginPath(); ctx.moveTo(SX(e.x0), SY(z)); ctx.lineTo(SX(e.x1), SY(z)); ctx.stroke(); }
  }

  // --- region fills -------------------------------------------------------------------------
  for (let i = 0; i < p.regions.length; i++) {
    const R = p.regions[i];
    for (const r of R.rects) {
      const x = SX(r.x0), y = SY(r.z0), w = (r.x1 - r.x0) * v.s, h = (r.z1 - r.z0) * v.s;
      if (R.kind === 'room') {
        ctx.fillStyle = R.custom ? ROOMC.custom : (ROOMC[R.type] || '#555');
        ctx.fillRect(x, y, w, h);
        // clear extent, i.e. the floor you can actually stand on: inset by the 0.15 skin
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(x + 0.15 * v.s, y + 0.15 * v.s, w - 0.30 * v.s, h - 0.30 * v.s);
      } else if (R.kind === 'corridor') {
        if (!S.show.corridors) continue;
        ctx.fillStyle = C.corridor; ctx.fillRect(x, y, w, h);
        dots(x, y, w, h, C.corridorInk);
        // the walkable clear extent, so a 1.60 m passage reads as narrower than its wall band
        ctx.strokeStyle = 'rgba(140,160,185,.20)'; ctx.lineWidth = 1;
        if (w > 6 && h > 6) ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      } else {
        ctx.fillStyle = C.void; ctx.fillRect(x, y, w, h);
        hatch(x, y, w, h, C.voidInk, 6);
      }
    }
  }

  // --- the zero-dig pocket: everywhere you can get to without swinging once --------------------
  if (S.show.pocket && S.pocket) {
    for (let i = 0; i < p.regions.length; i++) {
      if (!S.pocket.seen[i]) continue;
      for (const r of p.regions[i].rects) {
        const x = SX(r.x0), y = SY(r.z0), w = (r.x1 - r.x0) * v.s, h = (r.z1 - r.z0) * v.s;
        ctx.fillStyle = 'rgba(255,215,94,0.13)';
        ctx.fillRect(x, y, w, h);
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.strokeStyle = 'rgba(255,215,94,0.16)'; ctx.lineWidth = 1;
        for (let k = -h; k < w; k += 11) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + h, y + h); ctx.stroke(); }
        ctx.restore();
      }
    }
  }

  // --- selection ------------------------------------------------------------------------------
  if (S.edit && S.sel >= 0 && S.rooms && S.rooms[S.sel]) {
    const r = S.rooms[S.sel];
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.strokeRect(SX(r.x0), SY(r.z0), (r.x1 - r.x0) * v.s, (r.z1 - r.z0) * v.s);
    ctx.setLineDash([]);
    for (const [hx, hz] of corners(r)) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(SX(hx) - 4, SY(hz) - 4, 8, 8);
    }
  }

  // --- exterior envelope wall -----------------------------------------------------------------
  ctx.strokeStyle = C.envLine; ctx.lineWidth = Math.max(1.5, WALL_T * v.s);
  ctx.strokeRect(SX(e.x0) + WALL_T * v.s / 2, SY(e.z0) + WALL_T * v.s / 2,
    (e.x1 - e.x0 - WALL_T) * v.s, (e.z1 - e.z0 - WALL_T) * v.s);

  // --- every internal boundary, drawn as what it is -------------------------------------------
  const t = Math.max(1.2, WALL_T * v.s);
  for (const s of S.segs) {
    const band = segRect(s, WALL_T);          // the full structural wall band
    const clr = segRun(s, WALL_T);            // the clear run inside the corner returns

    // 1. the masonry itself
    ctx.fillStyle = s.solid ? C.wallSolid : C.wall;
    ctx.fillRect(band.x, band.y, band.w, band.h);

    if (!S.show.dig) continue;

    // 2. what kind of boundary it is
    if (s.solid) {
      hatch(band.x, band.y, band.w, band.h, '#0b0d10', 4);
    } else if (s.diggable) {
      ctx.fillStyle = C.digDim;
      ctx.fillRect(clr.x, clr.y, clr.w, clr.h);
      // 3. the ACTUAL dig panels the game would build, at the real authored lengths
      if (S.show.panels) {
        for (const sp of s.spans) {
          const q = segSub(s, sp.at, sp.len, WALL_T);
          ctx.fillStyle = C.dig;
          ctx.fillRect(q.x, q.y, q.w, q.h);
        }
        // 🚨 diggable by dig.js's 1.20 m rule but too short to carry ANY authored span.
        // These are the metres `wallinstances.js` cannot instance — house-packing.md §7.3.
        if (s.spans.length === 0) {
          ctx.strokeStyle = C.warn; ctx.lineWidth = 1;
          ctx.strokeRect(clr.x + .5, clr.y + .5, Math.max(1, clr.w - 1), Math.max(1, clr.h - 1));
        }
      } else {
        ctx.fillStyle = C.dig; ctx.fillRect(clr.x, clr.y, clr.w, clr.h);
      }

      /**
       * 3b. 🕳️ **THE SOFT SPOT — the one place on this wall a dig gets you through.**
       *
       * In the game there is brick BARRIER behind every orange metre — dig it all the way and
       * you get a visible, impassable, undamageable face and no route (`dig.js`: *"ordinary wall
       * segment -> barrier… you dug all the way and this is not the way through"*). Exactly ONE
       * blob per shared edge is different: `IC_W` = 1.55 m across, seeded, weighted toward the
       * longer spans, and reaching it *"turns the whole robot barrier off"* for everybody.
       *
       * 🚨 **AND THAT BARRIER IS NOT DRAWN ON THIS PLAN.** It sits behind the orange, in a
       * section this drawing does not have; the only thing drawn here is the one GAP in it. That
       * distinction is the whole of John's cyan complaint: he was told "the cyan is behind the
       * orange" and then shown a cyan mark ON the orange that meant the opposite. So this mark is
       * LIME, it is called the soft spot, and cyan on this plan now means one thing only.
       */
      const icHere = S.show.ic && s.spans.length ? interconnectOn(p.seed, s.key, s.spans) : null;

      /**
       * 3c. 🧱 **THE SLAB ARM — what this wall becomes if it is ONE face instead of tiles.**
       *
       * `dig.js` `SLAB`. Violet bar = one slab face. A red tick = a SEAM, and the label says
       * what forced it. Measured on this tree: the ~35 m cap forces **zero** seams because no
       * generated wall run is that long (longest 31.33 m over 512 seeds) — **every seam you see
       * is a door**, which is the blocker `dig.js` says out loud is not solved.
       */
      if (S.show.slabs) {
        for (const pc of s.slabs.pieces) {
          const q = segSub(s, pc.at, pc.len, WALL_T * 0.62);
          ctx.fillStyle = C.slab; ctx.fillRect(q.x, q.y, q.w, q.h);
        }
        if (s.slabs.n > 1) {
          for (let k = 1; k < s.slabs.pieces.length; k++) {
            const a0 = s.slabs.pieces[k - 1], b0 = s.slabs.pieces[k];
            const cut = (a0.at + a0.len + b0.at) / 2;
            const q = segSub(s, cut - 0.05, 0.10, WALL_T * 2.1);
            ctx.fillStyle = C.slabSeam; ctx.fillRect(q.x, q.y, q.w, q.h);
          }
        }
      }

      // 3d. …and the interconnect goes on LAST, so the slab overlay cannot bury the one thing on
      // this wall that is worth finding.
      if (icHere) {
        const q = segSub(s, icHere.at - icHere.w / 2, icHere.w, WALL_T * 1.5);
        ctx.fillStyle = C.icRing; ctx.fillRect(q.x - 1, q.y - 1, q.w + 2, q.h + 2);
        ctx.fillStyle = C.ic; ctx.fillRect(q.x, q.y, q.w, q.h);
        ctx.strokeStyle = '#0b0d10'; ctx.lineWidth = 1;
        ctx.strokeRect(q.x + .5, q.y + .5, Math.max(1, q.w - 1), Math.max(1, q.h - 1));
      }
    } else {
      ctx.fillStyle = C.nodig;
      ctx.fillRect(clr.x, clr.y, clr.w, clr.h);
    }

    /**
     * 4. 🚪 **DOORS — AND THE COLOUR THAT WAS ACTIVELY LYING.**
     *
     * ⚠️ **RED USED TO MEAN "CHAINED" AND JOHN READ IT AS "THE DOOR THE HUNTER BATTERS". IT IS
     * THE EXACT OPPOSITE, AND THE CONFUSION COMES FROM A NAME IN `src/`.** Read off the code
     * rather than inferred:
     *
     *   · `CHAINED_DEFS[0]` is `damageable: false`. `WallState.applyDamage` early-outs on it.
     *     **Nothing forces a chained connector — not the hammer, not the gun, not the hunter.**
     *   · `room.chainedDoorsOf()` — the set `hunter-ai.js` walks to and BANGS on — is named
     *     "chained" and does `if (!p.state.isDamageable()) continue;`. **So it returns the
     *     BREACHABLE interior doors and skips every chained one.** The shipped house has 4 of
     *     them (8 with `?doors=1`) and ZERO interior chained connectors.
     *   · The chain John sees hanging on things is `?tells=blind` DRESSING:
     *     `seedRand(seed,'dress.chain|'+id) < 0.50`, a property of the connector and never of
     *     its state. Half of everything wears one and it means nothing.
     *
     * So the door the hunter attacks is the AMBER one, and it now carries his mark. Red means
     * "padlocked — the way past this is the wall next to it".
     *
     *   OPEN        a green gap cut clean through — you walk it, free
     *   BREACHABLE  amber, hatched, magenta hunter chevrons — you break it AND he breaks it
     *   CHAINED     blacked out, red cross — nobody forces it. Dig instead.
     */
    if (S.show.doors && s.door && s.door !== 'none') {
      /**
       * ⚠️ **THE RENDERER CLAMPS AND REPORTS RATHER THAN OVERHANGING.** The generator now
       * guarantees `clear >= L_DOOR` on the run that carries the door (`canDoor` asks the
       * longest RUN, not the summed boundary). This is belt and braces: if that ever regresses,
       * the aperture is clipped to the wall and V5 in the VERIFICATION panel turns red, instead
       * of a green rectangle silently drifting over the corner of a room.
       */
      const w = Math.min(CONNECTOR_W, s.clear);
      const mid = Math.max(0, (s.clear - CONNECTOR_W) / 2);
      if (s.clear < L_DOOR - 1e-6) S.clamped.push(s);
      if (s.door === 'open') {
        const gap = segSub(s, mid, w, WALL_T * 1.06);
        ctx.fillStyle = '#0b0d10'; ctx.fillRect(gap.x, gap.y, gap.w, gap.h);   // cut the wall away
        const g2 = segSub(s, mid, w, WALL_T * 0.34);
        ctx.fillStyle = C.exit; ctx.fillRect(g2.x, g2.y, g2.w, g2.h);
      } else if (s.door === 'breachable') {
        const q = segSub(s, mid, w, WALL_T);
        ctx.fillStyle = '#4a3a12'; ctx.fillRect(q.x, q.y, q.w, q.h);
        hatch(q.x, q.y, q.w, q.h, '#ffbe4d', 4);
        ctx.strokeStyle = '#ffbe4d'; ctx.lineWidth = 1;
        ctx.strokeRect(q.x + .5, q.y + .5, Math.max(1, q.w - 1), Math.max(1, q.h - 1));
        // the hunter's mark: he walks to this one and hammers it. `room.chainedDoorsOf()`.
        if (s.hunterForces) hunterMark(q, s.axis);
      } else {
        const q = segSub(s, mid, w, WALL_T);
        ctx.fillStyle = '#1b1113'; ctx.fillRect(q.x, q.y, q.w, q.h);
        ctx.strokeStyle = C.warn; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + q.w, q.y + q.h);
        ctx.moveTo(q.x + q.w, q.y); ctx.lineTo(q.x, q.y + q.h); ctx.stroke();
      }
    }
  }

  // --- the one room with a wall to the outside -------------------------------------------------
  if (p.exitIdx >= 0) {
    const R = p.regions[p.exitIdx], r = R.rects[0];
    const f = exitFrontage(r, e);
    if (f) {
      ctx.fillStyle = C.exit;
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = C.exit; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.cx, f.cy); ctx.lineTo(f.cx + f.nx * 26, f.cy + f.ny * 26); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(f.cx + f.nx * 32, f.cy + f.ny * 32);
      ctx.lineTo(f.cx + f.nx * 22 - f.ny * 6, f.cy + f.ny * 22 + f.nx * 6);
      ctx.lineTo(f.cx + f.nx * 22 + f.ny * 6, f.cy + f.ny * 22 - f.nx * 6);
      ctx.closePath(); ctx.fill();
      // 🚪 THE THIRD KIND OF DOOR, and it is not on any interior wall. `EXIT_DEFS` is a
      // 15–25 s siege behind a yard. In the shipped house 14 sites are candidates and the run
      // promotes ONE; the other 13 are demoted to CHAINED and are the decoys. The generator
      // models only the live one — that is stated on the page, not implied.
      label(f.cx + f.nx * 46, f.cy + f.ny * 46, 'WAY OUT', C.exit, 11, true);
      label(f.cx + f.nx * 58, f.cy + f.ny * 58, '15–25 s siege', 'rgba(103,224,138,.66)', 9, true);
    }
  }

  // --- shortest solution ------------------------------------------------------------------------
  // ⚠️ TWO GUARDS, NOT ONE. `S.show.route` is a checkbox and checkboxes get clicked; `ROUTE_HIDDEN`
  // is the arm and cannot be reached without a reload. The arm must win.
  if (S.show.route && !ROUTE_HIDDEN) drawRoute();

  // --- labels -------------------------------------------------------------------------------------
  if (S.show.labels) {
    for (let i = 0; i < p.regions.length; i++) {
      const R = p.regions[i];
      const bb = bbox(R.rects);
      const cx = SX((bb.x0 + bb.x1) / 2), cy = SY((bb.z0 + bb.z1) / 2);
      const wpx = (bb.x1 - bb.x0) * v.s, hpx = (bb.z1 - bb.z0) * v.s;
      if (R.kind === 'room') {
        if (wpx < 42 || hpx < 20) continue;
        const nm = R.type.toUpperCase() + (R.rot ? ' ↻' : '');
        label(cx, cy - (S.show.sizes ? 7 : 0), nm, R.custom ? '#ffe7a0' : '#f0f3f7', Math.min(15, Math.max(9, wpx / 9)), true);
        if (S.show.sizes && hpx > 34) {
          const cw = (bb.x1 - bb.x0 - WALL_T), cd = (bb.z1 - bb.z0 - WALL_T);
          label(cx, cy + 8, `${cw.toFixed(1)} × ${cd.toFixed(1)} m`, 'rgba(240,243,247,.55)', 10.5, true);
        }
        if (R.custom && hpx > 48) label(cx, cy + 21, '⚠ NOT IN spaces.js', '#ffb0b0', 9.5, true);
      } else if (R.kind === 'corridor' && S.show.corridors) {
        if (wpx < 30 || hpx < 14) continue;
        label(cx, cy, R.id, '#9fb0c4', 10.5, true);
      } else if (R.kind === 'void') {
        if (wpx < 26 || hpx < 12) continue;
        label(cx, cy, 'VOID', '#4a515c', 9.5, true);
      }
      if (S.show.degree && R.kind !== 'void' && wpx > 34 && hpx > 34) {
        const d = p.edges.filter((x) => x.diggable && (x.ai === i || x.bi === i)).length;
        label(SX(bb.x1) - 12, SY(bb.z0) + 12, String(d), C.dig, 11, true);
      }
    }
  }

  // --- spawn / exit pips -----------------------------------------------------------------------
  pip(m.spawn, C.spawn, 'SPAWN');
  pip(p.exitIdx, C.exit, 'EXIT');
}

function pip(i, col, txt) {
  if (i < 0 || !S.plan.regions[i]) return;
  const bb = bbox(S.plan.regions[i].rects);
  const cx = SX((bb.x0 + bb.x1) / 2), cy = SY((bb.z0 + bb.z1) / 2);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy + 26, 5, 0, 7); ctx.fill();
  label(cx, cy + 42, txt, col, 9.5, true);
}

function drawRoute() {
  // the shortest spawn->exit walk the player can actually make: open doors free, everything
  // else costs one dig. Same edge set `measure()` scores `digsToExit` on.
  const p = S.plan, n = p.regions.length;
  const adj = Array.from({ length: n }, () => []);
  for (const e of p.edges) {
    if (!(e.door === 'open' || e.door === 'breachable' || e.diggable)) continue;
    const w = e.door === 'open' ? 0 : 1;
    adj[e.ai].push([e.bi, w, e]); adj[e.bi].push([e.ai, w, e]);
  }
  const src = S.m.spawn, dst = p.exitIdx;
  if (src < 0 || dst < 0) return;
  const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), pe = new Array(n).fill(null);
  dist[src] = 0;
  for (let it = 0; it < n; it++) {
    for (let u = 0; u < n; u++) { if (dist[u] === Infinity) continue;
      for (const [v, w, ed] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; pe[v] = ed; } }
  }
  if (dist[dst] === Infinity) return;
  const path = []; for (let u = dst; u >= 0; u = prev[u]) path.push(u);
  path.reverse();
  ctx.strokeStyle = C.route; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const bb = bbox(S.plan.regions[path[i]].rects);
    const cx = SX((bb.x0 + bb.x1) / 2), cy = SY((bb.z0 + bb.z1) / 2);
    i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
  }
  ctx.stroke(); ctx.setLineDash([]);
  // mark each wall the route has to break
  for (let i = 1; i < path.length; i++) {
    const ed = pe[path[i]];
    if (!ed || ed.door === 'open') continue;
    const seg = S.segs.find((s) => (s.ai === ed.ai && s.bi === ed.bi));
    if (!seg) continue;
    const q = segSub(seg, Math.max(0, (seg.clear - 1.4) / 2), Math.min(1.4, seg.clear), WALL_T * 1.5);
    ctx.strokeStyle = C.route; ctx.lineWidth = 2;
    ctx.strokeRect(q.x, q.y, q.w, q.h);
  }
}

// --- geometry helpers (pixels only — none of this is the algorithm) --------------------------
function segRect(s, thick) {
  const v = S.view, h = thick / 2;
  return s.axis === 'x'
    ? { x: SX(s.at - h), y: SY(s.lo), w: thick * v.s, h: (s.hi - s.lo) * v.s }
    : { x: SX(s.lo), y: SY(s.at - h), w: (s.hi - s.lo) * v.s, h: thick * v.s };
}
function segRun(s, thick) {
  const v = S.view, h = thick / 2;
  return s.axis === 'x'
    ? { x: SX(s.at - h), y: SY(s.cLo), w: thick * v.s, h: (s.cHi - s.cLo) * v.s }
    : { x: SX(s.cLo), y: SY(s.at - h), w: (s.cHi - s.cLo) * v.s, h: thick * v.s };
}
function segSub(s, at, len, thick) {
  const v = S.view, h = thick / 2;
  return s.axis === 'x'
    ? { x: SX(s.at - h), y: SY(s.cLo + at), w: thick * v.s, h: len * v.s }
    : { x: SX(s.cLo + at), y: SY(s.at - h), w: len * v.s, h: thick * v.s };
}
function exitFrontage(r, e) {
  const v = S.view, T = WALL_T;
  const mk = (x0, z0, x1, z1, nx, ny) => ({
    x: SX(x0), y: SY(z0), w: (x1 - x0) * v.s, h: (z1 - z0) * v.s,
    cx: SX((x0 + x1) / 2), cy: SY((z0 + z1) / 2), nx, ny,
  });
  const c = 2.48;
  if (Math.abs(r.x0 - e.x0) < 1e-6 && r.z1 - r.z0 - T >= c) { const m = (r.z0 + r.z1) / 2; return mk(r.x0, m - c / 2, r.x0 + T, m + c / 2, -1, 0); }
  if (Math.abs(r.x1 - e.x1) < 1e-6 && r.z1 - r.z0 - T >= c) { const m = (r.z0 + r.z1) / 2; return mk(r.x1 - T, m - c / 2, r.x1, m + c / 2, 1, 0); }
  if (Math.abs(r.z0 - e.z0) < 1e-6 && r.x1 - r.x0 - T >= c) { const m = (r.x0 + r.x1) / 2; return mk(m - c / 2, r.z0, m + c / 2, r.z0 + T, 0, -1); }
  if (Math.abs(r.z1 - e.z1) < 1e-6 && r.x1 - r.x0 - T >= c) { const m = (r.x0 + r.x1) / 2; return mk(m - c / 2, r.z1 - T, m + c / 2, r.z1, 0, 1); }
  return null;
}
const bbox = (rs) => rs.reduce((a, r) => ({
  x0: Math.min(a.x0, r.x0), x1: Math.max(a.x1, r.x1),
  z0: Math.min(a.z0, r.z0), z1: Math.max(a.z1, r.z1),
}), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
const corners = (r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]];

function label(x, y, txt, col, size, centre) {
  ctx.font = `${size}px ui-monospace,Consolas,monospace`;
  ctx.textAlign = centre ? 'center' : 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,.62)';
  ctx.fillText(txt, x + 1, y + 1);
  ctx.fillStyle = col;
  ctx.fillText(txt, x, y);
  ctx.textAlign = 'left';
}
function hatch(x, y, w, h, col, step) {
  if (w < 2 || h < 2) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = col; ctx.lineWidth = 1;
  for (let i = -h; i < w; i += step) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  ctx.restore();
}
/**
 * 🔨 THE HUNTER'S MARK — two chevrons pointing INTO the door, on the amber ones only.
 *
 * This is `room.chainedDoorsOf()`'s set: interior, damageable, currently closed. He walks to the
 * `stand` point it hands him and swings; `hunter-ai.js` puts a breachable door at SIX blows,
 * ~14 s of banging, and that is the noise that tells you he is coming through.
 */
function hunterMark(q, axis) {
  const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
  const r = Math.max(3, Math.min(7, (axis === 'x' ? q.h : q.w) * 0.16));
  ctx.strokeStyle = C.hunter; ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const d of [-1, 1]) {
    if (axis === 'x') {                       // wall runs along z: chevrons point in along x
      ctx.moveTo(cx + d * r * 2.1, cy - r); ctx.lineTo(cx + d * r * 0.7, cy); ctx.lineTo(cx + d * r * 2.1, cy + r);
    } else {
      ctx.moveTo(cx - r, cy + d * r * 2.1); ctx.lineTo(cx, cy + d * r * 0.7); ctx.lineTo(cx + r, cy + d * r * 2.1);
    }
  }
  ctx.stroke();
}
function dots(x, y, w, h, col) {
  if (w < 6 || h < 6) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = col;
  const st = 9;
  for (let a = x + 4; a < x + w; a += st) for (let b = y + 4; b < y + h; b += st) ctx.fillRect(a, b, 1.4, 1.4);
  ctx.restore();
}

// ===========================================================================================
// panels
// ===========================================================================================

function fmt(n, d = 1) { return Number(n).toFixed(d); }
function grid(el, rows) {
  el.innerHTML = rows.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('');
}

function panels() {
  const m = S.m, p = S.plan;

  // --- metrics ------------------------------------------------------------------------------
  const env = p.env;
  grid($('metrics'), [
    ['envelope', `${fmt(env.x1 - env.x0)} × ${fmt(env.z1 - env.z0)} m`],
    ['rooms / corridors / voids', `${m.nRooms} / ${m.nCorridors} / <span class="${m.nVoids ? 'bad' : 'mut'}">${m.nVoids}</span>`],
    ['floor: rooms', `${fmt(m.roomArea, 0)} m²`],
    ['floor: corridor', `${fmt(m.corrArea, 0)} m² <span class="mut">(${fmt(100 * m.corridorShare, 0)}%)</span>`],
    ['<b>shared wall, internal</b>', `<b>${fmt(m.sharedM)} m</b>`],
    ['<b class="hi">of which diggable</b>', `<b class="hi">${fmt(m.diggableM)} m</b>`],
    ['<b class="hi">diggable / internal</b>', `<b class="hi">${fmt(100 * m.fracInternal)} %</b>`],
    ['diggable / all boundary', `${fmt(100 * m.fracTotal)} %`],
    // ⚠️ NOT the "24.2 m on 5 edges" in house-packing.md §1 — that figure is stale by 2×.
    // DIG_EDGES on disk after digcover-1 is 7 edges / 14 spans / 47.72 m, and the authored
    // mansion's own room-to-room wall is 90.8 m, so the honest comparison is 52.6% -> 92.8%.
    // Re-counted from src/game/dig.js on 2026-08-09; the control lives in genspike's selftest.
    ['<span class="mut">the house you play, for scale</span>', '<span class="mut">47.7 m / 90.8 m = 52.6%</span>'],
    ['exterior perimeter', `${fmt(m.exteriorM)} m`],
    ['dig panels this plan builds', `${m.nSpans}`],
    ['sliver boundaries &lt; 1.20 m', `<span class="${m.sliverEdges ? 'bad' : 'mut'}">${m.sliverEdges}</span>`],
    ['alcoves (recess off a corridor)', `<span class="mut">${m.sliverRects}</span>`],
    ['diggable but unbuildable', `<span class="${m.unspannableEdges ? 'bad' : 'mut'}">${m.unspannableEdges}</span> <span class="mut">= ${fmt(m.unspannableM)} m</span>`],
    ['<b>doors you walk</b> <span class="mut">(open)</span>', `<span class="gd">${m.doorsOpen}</span>`],
    ['<b>doors the hunter batters</b> <span class="mut">(breachable)</span>', `<span style="color:#ffbe4d">${m.doorsBreachable}</span>`],
    ['<b>doors nobody forces</b> <span class="mut">(chained — dig instead)</span>', `<span class="bad">${m.doorsChained}</span>`],
    ['every region reachable', m.allReach ? '<span class="gd">yes</span>' : '<span class="bad">NO</span>'],
    ['hunter reaches everything', m.hunterAll ? '<span class="gd">yes</span>' : '<span class="bad">NO</span>'],
    ['every room on a corridor', m.roomsOnCorridor ? '<span class="gd">yes</span>' : `<span class="bad">${fmt(100 * m.roomsOnCorridorFrac, 0)}%</span>`],
  ]);

  // --- flatness -----------------------------------------------------------------------------
  const f = m.flat;
  $('flatVerdict').innerHTML = f.flat
    ? `<div class="verdict no">FLAT — depth ${f.depth}. This is one file of rooms; nothing is behind
       anything.<br><span style="opacity:.8">It will score well on every other number on this page and it
       is still the dullest house the generator makes. Label it and move on — that is how it gets
       fixed.</span></div>`
    : `<div class="verdict ok">Not flat — depth ${f.depth}. There is a second rank of rooms to get
       lost behind. <span style="opacity:.8">The mansion you already play also scores 3.</span></div>`;
  grid($('flatGrid'), [
    ['<b>depth</b> <span class="mut">= min(H, V) · flat at ≤ 2</span>', `<b>${f.depth}</b>`],
    ['rooms crossed left→right', `${f.crossedH}`],
    ['rooms crossed top→bottom', `${f.crossedV}`],
    ['<span class="mut">the authored mansion</span>', '<span class="mut">3 — the control</span>'],
    ['rank depth <span class="mut">(continuous)</span>', `${fmt(f.depthMean, 2)}`],
    ['fraction with 2+ ranks', `${fmt(100 * f.rank2, 0)} %`],
    ['envelope aspect', `${fmt(f.aspect, 2)} : 1`],
    ['<span class="mut">measured over 512 seeds</span>', '<span class="mut">42.4% are flat</span>'],
  ]);
  drawStrip();

  // --- the zero-dig pocket ---------------------------------------------------------------------
  const pk = S.pocket;
  $('pocketBox').innerHTML = `
    <div class="grid">
      <div><b>how much of the house you can walk into<br>before you swing the hammer once</b></div><div><b>${fmt(100 * pk.frac, 1)} %</b></div>
      <div>that is</div><div>${fmt(pk.area, 0)} m² · ${pk.rooms} room${pk.rooms === 1 ? '' : 's'}</div>
      ${ROUTE_HIDDEN ? '' : `<div>can you walk to the way out?</div><div>${pk.reachesExit ? '<span class="bad">YES — no dig needed</span>' : '<span class="gd">no, you have to break something</span>'}</div>`}
      <div><span class="mut">measured across the sample</span></div><div><span class="mut">18.2%</span></div>
    </div>`;

  // --- 🧱 the slab arm --------------------------------------------------------------------------
  /**
   * ⚠️ **HONEST, INCLUDING THE PART THAT IS NOT SOLVED.** Two numbers here, and the second is the
   * one that matters: how many of this plan's walls could be ONE face, and how many come out with
   * a seam — with the reason named. Every seam in this generator is a door, because no run is long
   * enough to hit the cap.
   */
  const segs = S.segs.filter((s) => s.diggable);
  const nSlab = segs.reduce((k, s) => k + s.slabs.n, 0);
  const whole = segs.filter((s) => s.slabs.reason === 'one').length;
  const byDoor = segs.filter((s) => s.slabs.reason === 'door' || s.slabs.reason === 'door+cap').length;
  const byCap = segs.filter((s) => s.slabs.reason === 'cap' || s.slabs.reason === 'door+cap').length;
  const longest = S.segs.reduce((k, s) => Math.max(k, s.clear), 0);
  $('slabBox').innerHTML = `
    <div class="grid">
      <div><b>diggable walls in this house</b></div><div><b>${segs.length}</b></div>
      <div>as tiles, today</div><div>${m.nSpans} dig panels</div>
      <div><b>as slabs</b></div><div><b>${nSlab} faces</b></div>
      <div><span class="gd">one whole wall, no seam</span></div><div><span class="gd">${whole}</span> <span class="mut">= ${fmt(100 * whole / Math.max(1, segs.length), 0)}%</span></div>
      <div><span class="bad">seam forced by a DOOR</span></div><div><span class="bad">${byDoor}</span></div>
      <div>seam forced by the ${SLAB_MAX} m cap</div><div>${byCap ? `<span class="bad">${byCap}</span>` : '<span class="mut">0</span>'}</div>
      <div>longest single wall here</div><div>${fmt(longest)} m</div>
    </div>
    <div class="verdict ${byDoor ? 'mid' : 'ok'}" style="margin-top:8px;font-size:11.5px">
      ${byDoor
    ? `<b>${byDoor} of these walls cannot be one piece, and every one of them is a door.</b>
         A slab cannot contain an aperture yet — <code>dig.js</code> says so in as many words — so the
         wall has to be cut either side of the doorway. That is a seam in the middle of the wall,
         which is the thing you said you did not want.`
    : `<b>Every diggable wall in this plan could be a single slab.</b> None of them carries a door
         and none is longer than the ${SLAB_MAX} m cap.`}
    </div>`;

  // --- gap-0 comparison -----------------------------------------------------------------------
  if (S.gap0) {
    const g = S.gap0;
    const row = (name, a, b, unit = '') => {
      const up = b > a;
      return `<tr><td>${name}</td><td>${fmt(a)}${unit}</td><td class="${up ? 'gd' : 'bad'}">${fmt(b)}${unit}</td></tr>`;
    };
    $('gapCmp').innerHTML =
      `<tr><th>&nbsp;</th><th>gap 0 · flush</th><th>gap ${S.dials.gap} · yours</th></tr>`
      + row('shared wall', g.sharedM, m.sharedM, ' m')
      + row('diggable', g.diggableM, m.diggableM, ' m')
      + row('diggable / internal', 100 * g.fracInternal, 100 * m.fracInternal, ' %')
      + row('corridor floor', g.corrArea, m.corrArea, ' m²')
      + row('rooms on a corridor', 100 * g.roomsOnCorridorFrac, 100 * m.roomsOnCorridorFrac, ' %')
      // ⚠️ this row states `digsToExit` twice over — hidden with the rest of the route arm
      + (ROUTE_HIDDEN ? '' : `<tr><td>digs, spawn → exit</td><td>${g.digsToExit}</td><td>${m.digsToExit}</td></tr>`);
  } else {
    $('gapCmp').innerHTML = '<tr><td class="mut">not available for a hand-edited layout — press "back to the seed"</td></tr>';
  }

  // --- difficulty ------------------------------------------------------------------------------
  const d = m.difficulty;
  /**
   * 🚨 THE ROUTE BLOCK IS THE LEAK, AND ALL FIVE ROWS OF IT ARE. `routeDigs`/`routeRegions` ARE
   * `digsToExit`/`hopsToExit`; `farthest*` and `meanDigsFromSpawn` are the same walk from the same
   * spawn; and the `8 s` verdict is literally `digsToExit >= 2 || hopsToExit >= 3` rendered as a
   * word. In the hidden arm the block is replaced by a line saying so, rather than silently
   * vanishing — a panel that quietly loses rows is how someone later concludes the tool is broken.
   */
  const ROUTE_ROWS = ROUTE_HIDDEN ? [
    ['<b>ROUTE</b>', '<span style="color:#c98cff">hidden in this arm</span>'],
    ['<span class="mut">every number here is the spawn → exit walk</span>', '<span class="mut">— press H to show</span>'],
  ] : [
    ['<b>ROUTE</b>', ''],
    ['walls to break, spawn → exit', `${d.routeDigs}`],
    ['regions crossed', `${d.routeRegions}`],
    ['deepest point of the house', `${d.farthestDigs} digs / ${d.farthestRegions} regions`],
    ['mean digs to anywhere', `${fmt(d.meanDigsFromSpawn, 2)}`],
    ['<span class="mut">a run cannot be won in 8 s</span>', (d.routeDigs >= 2 || d.routeRegions >= 3) ? '<span class="gd">passes</span>' : '<span class="bad">FAILS</span>'],
  ];
  grid($('difficulty'), [
    ...ROUTE_ROWS,
    ['<b>TOPOLOGY</b>', ''],
    ['dead-end rooms', `${d.deadEndRooms}`],
    ['loops in the graph', `${d.loops}`],
    ['separate corridor networks', `${d.corridorNetworks}`],
    ['<b>THE HUNTER, WHEN HE EXISTS</b>', ''],
    ['rooms he can hear you from', `${d.roomsOnCorridor} / ${d.roomsTotal}`],
    ['longest sightline in one space', `${fmt(d.longestSightline)} m`],
    ['biggest corridor span', `${fmt(d.biggestCorridorSpan)} m`],
    ['rooms visible off it', `${d.roomsOnBiggestCorridor}`],
    ['<b>COVER</b>', ''],
    ['boundaries he can come through', `${d.diggableEdges}`],
    ['boundaries that stop him', `<span class="cy">${d.undiggableEdges}</span>`],
    ['open doors', `${d.openDoors}`],
    ['<b>SHAPE</b>', ''],
    ['rank depth', `${fmt(d.depthMean, 2)}${d.isFlat ? ' <span class="bad">FLAT</span>' : d.isShallow ? ' <span style="color:#ffdf9a">shallow</span>' : ''}`],
  ]);

  verify();
}

function drawStrip() {
  // 🚨 THE PICTURE THAT CATCHES A FLAT PLAN. The number `depthMean` is computed by the harness;
  // this only draws the slabs it is a mean of. The verification panel asserts that the mean of
  // what is drawn equals the harness's own figure, so the picture cannot lie about the number.
  const p = S.plan;
  const rooms = p.regions.filter((r) => r.kind === 'room').map((r) => r.rects[0]);
  const e = p.env, W = e.x1 - e.x0, D = e.z1 - e.z0;
  const longIsX = W >= D, L = Math.max(W, D);
  const lIv = rooms.map((r) => (longIsX ? [r.x0, r.x1] : [r.z0, r.z1]));
  const lo = longIsX ? e.x0 : e.z0;
  const cuts = [...new Set(lIv.flat())].sort((a, b) => a - b);
  const w = strip._w, h = 46;
  sctx.clearRect(0, 0, w, h);
  sctx.fillStyle = '#0c0e11'; sctx.fillRect(0, 0, w, h);
  const slabs = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1], t = (a + b) / 2;
    let c = 0; for (const iv of lIv) if (iv[0] < t && iv[1] > t) c++;
    slabs.push({ a, b, c });
    const x0 = ((a - lo) / L) * w, x1 = ((b - lo) / L) * w;
    sctx.fillStyle = RANKC[Math.min(3, c)];
    sctx.fillRect(x0, 8, Math.max(1, x1 - x0), 22);
  }
  strip._slabs = slabs;
  sctx.font = '9.5px ui-monospace,Consolas,monospace';
  sctx.fillStyle = C.faint;
  sctx.fillText(`0 m`, 1, 41);
  sctx.textAlign = 'right'; sctx.fillText(`${L.toFixed(0)} m along the long axis`, w - 1, 41);
  sctx.textAlign = 'left'; sctx.fillText(longIsX ? 'X' : 'Z', 1, 6);
  sctx.textAlign = 'left';
}

// ===========================================================================================
// VERIFICATION — does the picture match the arithmetic?
// ===========================================================================================
/**
 * ⚠️ THE BRIEF'S HARDEST REQUIREMENT: "a tool that renders a plan wrongly is worse than no tool
 * — it would send John's judgement in the wrong direction." So the tool audits itself, every
 * frame, in front of him, and the result is on the page rather than in a document.
 *
 * Six checks, each comparing something the PICTURE is built from against something the HARNESS
 * computed by a different route. Checks 5 and 6 are John's *"green open door clipping on the
 * corner of the rooms and into the hallway"*, turned into an assertion that runs on every frame:
 *
 *  1. STRUCTURAL CONTACT. `boundarySegments()` merges touching intervals per wall line; `measure()`
 *     sums `contactS` pairwise over rects. Different code, and the totals must agree. Tolerance is
 *     `0.001 × nEdges` because `edge.clear` is stored to three decimals.
 *  2. COMPLETE PARTITION. Every pixel of the envelope belongs to exactly one region. Summing the
 *     drawn rectangles must return the envelope area.
 *  3. NOTHING UNDRAWN. Every edge in the graph produced at least one visible wall run.
 *  4. THE FLATNESS STRIP. The mean of the slabs actually painted must equal `measure().depthMean`.
 *
 *  5. NO DOOR OUTSIDE ITS WALL. Nothing the renderer had to clamp.
 *  6. ONE DOOR PER BOUNDARY, even when the boundary is several separate stretches of wall.
 *
 * The last line is not a check, it is an accounting note that would otherwise look like a bug:
 * `measure()` deducts ONE pair of 0.15 m corner returns per EDGE, while the geometry has one pair
 * per WALL RUN. About 6.4 boundaries per plan are two or more separate runs, so the harness's
 * clear metres run ~0.6% long. It moves the headline by 0.04 points and it is reported, not hidden.
 */
function verify() {
  const p = S.plan, m = S.m, segs = S.segs;
  const out = [];
  const pass = (ok, txt, detail) => out.push(
    `<div style="margin-bottom:5px"><span class="${ok ? 'gd' : 'bad'}">${ok ? '✓ PASS' : '✗ FAIL'}</span>
     <span style="color:var(--dim)">${txt}</span><br>
     <span class="mut" style="font-size:11px;padding-left:14px">${detail}</span></div>`);

  // 1
  const sStruct = segs.reduce((a, x) => a + x.struct, 0);
  const eStruct = p.edges.reduce((a, e) => a + e.clear + WALL_T, 0);
  const tol = 0.001 * Math.max(1, p.edges.length);
  pass(Math.abs(sStruct - eStruct) <= tol,
    'the walls drawn are the walls measured',
    `drawn ${sStruct.toFixed(3)} m of structural contact · harness ${eStruct.toFixed(3)} m · Δ ${(sStruct - eStruct).toExponential(1)} m (tolerance ${tol.toFixed(3)})`);

  // 2
  const area = p.regions.flatMap((R) => R.rects).reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  const envA = (p.env.x1 - p.env.x0) * (p.env.z1 - p.env.z0);
  pass(Math.abs(area - envA) < 1e-6,
    'complete partition — no gap, no overlap',
    `regions ${area.toFixed(4)} m² · envelope ${envA.toFixed(4)} m² · Δ ${(area - envA).toExponential(1)}`);

  // 3
  const drawn = new Set(segs.map((s) => `${s.ai}|${s.bi}`));
  const missing = p.edges.filter((e) => !drawn.has(`${e.ai}|${e.bi}`));
  pass(missing.length === 0,
    'every boundary in the graph is on screen',
    `${p.edges.length} boundaries → ${segs.length} wall runs drawn · ${missing.length} missing`);

  // 4
  const sl = strip._slabs || [];
  let ws = 0, wl = 0;
  for (const s of sl) { if (s.c === 0) continue; ws += s.c * (s.b - s.a); wl += (s.b - s.a); }
  const drawnMean = wl ? ws / wl : 0;
  pass(Math.abs(drawnMean - m.flat.depthMean) < 0.002,
    'the flatness bar is the flatness number',
    `bar ${drawnMean.toFixed(3)} · harness ${m.flat.depthMean.toFixed(3)}`);

  /**
   * 5 — 🚨 **NO DOOR IS DRAWN OUTSIDE ITS OWN WALL.** This is the check for the defect John
   * reported: *"sometimes I see the green open door clipping on the corner of the rooms and into
   * the hallway."* It was real, it was BOTH a plan defect and a drawing defect, and the plan half
   * was the cause: `canDoor` compared the door's 2.48 m against a boundary's SUMMED contact, and a
   * boundary can be several separate stretches of wall. A boundary that was two 1.4 m stubs
   * claimed a door no stretch of it could hold, and the renderer then centred a 2.08 m aperture on
   * a 1.1 m run — hanging 0.5 m out of each end.
   *
   * Measured before the fix, 512 seeds: **891 of 11,638 door-bearing runs (7.66%) were too short,
   * 790 shorter than the aperture itself, worst overhang 1.04 m per end, and 433 of 512 seeds
   * (84.6%) had at least one.** `canDoor` now asks the longest contiguous RUN.
   *
   * `S.clamped` is what the renderer had to clip. It must always be empty.
   */
  pass(S.clamped.length === 0,
    'no door is drawn outside the wall it belongs to',
    S.clamped.length === 0
      ? `every one of ${segs.filter((s) => s.door !== 'none').length} apertures fits inside its own wall run (needs ${L_DOOR} m; shortest that has one is ${fmt(Math.min(...segs.filter((s) => s.door !== 'none').map((s) => s.clear), Infinity))} m)`
      : `${S.clamped.length} aperture(s) had to be CLIPPED to the wall — the generator has regressed, not the drawing`);

  /**
   * 6 — ONE DOOR PER BOUNDARY. A door state is one aperture in one place; it used to be stamped
   * on every run of a multi-run boundary, so one door appeared two and three times across the
   * house. 2,349 of 11,356 edges over 512 seeds did that.
   */
  const perEdge = new Map();
  for (const s of segs) if (s.door !== 'none') perEdge.set(`${s.ai}|${s.bi}`, (perEdge.get(`${s.ai}|${s.bi}`) || 0) + 1);
  const dbl = [...perEdge.values()].filter((k) => k > 1).length;
  const multi = p.edges.filter((e) => e.nRuns > 1).length;
  pass(dbl === 0,
    'each boundary draws its one door exactly once',
    `${multi} of ${p.edges.length} boundaries here are more than one separate stretch of wall · ${dbl} draw a duplicate door`);

  // — accounting note, not a check
  const segClear = segs.reduce((a, x) => a + x.clear, 0);
  const extra = segs.length - p.edges.length;
  out.push(`<div style="margin-top:9px;padding-top:8px;border-top:1px solid var(--line)">
    <span style="color:var(--dim)">NOTE, not a failure.</span>
    <span class="mut" style="font-size:11px">The harness charges one pair of 0.15 m corner returns per
    <i>boundary</i>; the geometry has one pair per <i>wall run</i>, and ${extra} boundaries here are
    more than one run. So the harness reads <b>${m.sharedM.toFixed(1)} m</b> of clear shared wall and
    the drawn geometry reads <b>${segClear.toFixed(1)} m</b> — the harness runs about 0.6% long across
    512 seeds, which moves the 92.8% headline by 0.04 points. Reported rather than quietly corrected,
    because changing it would move every figure in <code>house-packing.md</code>.</span></div>`);

  if (CTL_CLIP) {
    out.unshift(`<div class="verdict no" style="font-size:11.5px"><b>⚠️ CONTROL ARM — <code>?ctl=clip</code></b><br>
      The door-clipping defect has been PUT BACK on purpose: door eligibility decided on the
      boundary's summed contact instead of its longest wall run, stamped on every run.
      <b>Checks 5 and 6 below must be RED.</b> If they are green, they cannot see the defect they
      were written for and their normal green means nothing. Drop <code>?ctl=clip</code> to go back
      to the real tool.</div>`);
  } else {
    out.push(`<div style="margin-top:9px" class="mut">🚨 <b>Are checks 5 and 6 able to fail?</b>
      Open <a href="?ctl=clip&amp;seed=${S.seed}" style="color:var(--dig)">?ctl=clip</a> — it puts the
      clipping defect back and both must turn red. That arm is the only reason to believe the green.</div>`);
  }

  out.push(`<div style="margin-top:9px" class="mut">Check any of this by hand:
    <code>node harness/genspike.mjs --seed ${S.seed}</code>${S.rooms ? ' <span class="bad">(hand-edited — the CLI will show the unedited seed)</span>' : ''}</div>`);
  $('verify').innerHTML = out.join('');
}

// ===========================================================================================
// static panels
// ===========================================================================================

/**
 * 🎯 **THE LEGEND HAS TO EXPLAIN ITSELF IN THE PLAYER'S TERMS, BECAUSE JOHN HAD TO ASK.**
 *
 * He asked four questions about this picture — is the orange inclusive of the cyan behind it,
 * what is the brown, what is the zero-dig pocket, and why is red on the wrong doors. Every one of
 * them was a legend that named a COLOUR IN THE CODE instead of a THING IN THE GAME. Each row below
 * therefore says what it is *for the person playing*, and the four that were asked about carry the
 * answer in full rather than a pointer to a document.
 */
function legend() {
  const it = [
    [C.dig, '<b>ORANGE — a dig panel.</b> The ornate coat you smash off with the hammer, at the real '
      + `lengths the game builds: ${AUTHORED_SPANS.join(' / ')} m. <b>Orange means "somewhere worth `
      + 'searching", not "a way out of this room"</b> — there is unbreakable brick behind all of it '
      + 'except the lime blob below. <b>That brick is not drawn on this plan</b>, because it is '
      + 'behind the wall and this is a view from above; the only part of it you can see here is the '
      + 'one gap in it.'],
    [C.digDim, '<b>BROWN — the rest of that same diggable wall.</b> ⟵ <i>you asked.</i> It is not a '
      + 'different kind of wall and it is not a small dig panel. A dig panel has to be one of the '
      + 'three lengths above with 0.28 m of ordinary wall each side of it, so on most walls a bit '
      + 'is left over at the ends and between panels. <b>Brown is that leftover.</b> If a whole '
      + 'boundary is brown with a red outline, no panel fitted at all and none of it can be dug.'],
    [C.ic, '<b>LIME BLOB — THE SOFT SPOT. Dig here and you are through.</b> ⟵ <i>this one used to '
      + 'be cyan and that was wrong; you spotted it.</i> One per shared wall, 1.55 m across, put '
      + 'there by the seed. Dig anywhere ELSE on an orange wall and you reach brick you cannot '
      + 'break — a lot of work for no route. Dig the soft spot and you are in the next room, and '
      + 'the first person in the house to find one <b>switches that brick off for everybody.</b> '
      + 'You cannot see it in the game; you find it by digging. It is lime because it is the only '
      + 'mark on this plan that is a <b>prize</b> rather than a kind of wall.'],
    [C.nodig, '<b>CYAN BAR — no dig here at all, and cyan now means only this.</b> Under 1.20 m of '
      + 'shared wall, so the game cannot fit a dig face on it. There is no orange in front of it '
      + 'and nothing to try: it is a hard stop, and the way past it is the wall next to it.'],
    [C.wallSolid, '<b>wall onto VOID</b> — solid masonry, nothing behind it, nowhere to go.'],
    [C.exit, '<b>OPEN door</b> — the wall is cut through. Walk it, free, both of you.'],
    ['#ffbe4d', '<b>BREACHABLE door — and THIS is the one the hunter batters.</b> ⟵ <i>you asked.</i> '
      + 'Six blows, about 14 s of banging, and he is in. You can break it too, cheaply. '
      + '<b>It wears a chain about half the time and that means nothing</b> — the chain is seeded '
      + 'dressing (<code>?tells=blind</code>), never read off the door\'s state, which is the whole '
      + 'point of it.'],
    [C.hunter, '<b>the hunter\'s mark</b> — drawn on every door he can force, and nowhere else.'],
    [C.warn, '<b>CHAINED door — nobody forces it. Not you, not him.</b> ⟵ <i>this is the one that '
      + 'was drawn wrong.</i> A padlock is <code>damageable: false</code>; the hunter\'s own door '
      + 'list skips it by name. <b>The way past a chained door is the wall beside it.</b>'],
    [C.slab, '<b>SLAB</b> — one single wall face instead of tiles, if you turn it on. '
      + `Red tick = a seam, i.e. it could NOT be one piece. Cap ${SLAB_MAX} m.`],
    ['rgba(255,215,94,0.35)', '<b>THE ZERO-DIG POCKET.</b> ⟵ <i>you asked.</i> Everywhere you can '
      + 'walk to from where you start <b>without swinging the hammer once</b> — open doors only. '
      + 'Big pocket = the house lets you in and the run starts as exploring. Tiny pocket = you are '
      + 'against a wall from the first second.'],
    [C.spawn, '<b>where the player starts.</b>'],
    // hidden with the rest of the route arm — a legend entry for a mark that is not drawn is
    // itself a statement that the mark exists, and half the answer is "how long is it"
    ...(ROUTE_HIDDEN ? [] : [[C.route, '<b>the shortest solution</b>, and a box round every wall it has to break.']]),
    [C.corridor, '<b>corridor</b> — dark in the game, walkable, at least 1.60 m, and the hunter\'s '
      + 'eventually. Drawn light here so you can see the circulation.'],
    [C.void, '<b>VOID</b> — leftover space nobody can walk in, filled with masonry. A failure, '
      + 'and it is counted.'],
  ];
  $('legend').innerHTML = it.map(([c, t]) =>
    `<span><i class="swatch" style="background:${c}"></i></span><span>${t}</span>`).join('');
}

function toggles() {
  const it = [
    ['dig', 'diggable / not-diggable colouring'],
    ['panels', 'the individual dig panels'],
    ['ic', 'the soft spot — the one way through per wall (the interconnect)'],
    ['slabs', '🧱 SLAB ARM — draw each wall as one face instead of tiles'],
    ['doors', 'doors and their state'],
    ['pocket', 'the zero-dig pocket'],
    ['corridors', 'corridor fill'],
    ['labels', 'room names'],
    ['sizes', 'room dimensions'],
    // ⚠️ REMOVED, not just unticked, in the hidden arm. An unticked box he can click is not an arm.
    ...(ROUTE_HIDDEN ? [] : [['route', 'shortest solution']]),
    ['degree', 'diggable neighbours per region'],
    ['grid', '5 m grid'],
  ];
  $('toggles').innerHTML = it.map(([k, t]) =>
    `<label class="chk"><input type="checkbox" data-k="${k}" ${S.show[k] ? 'checked' : ''}> ${t}</label>`).join('');
  $('toggles').querySelectorAll('input').forEach((el) => el.addEventListener('change', () => {
    S.show[el.dataset.k] = el.checked; draw();
  }));
}

const DIALS = [
  ['gap', 0, 4, 0.1, 'GAP — corridors vs raw contact',
    'How hard the packer tries to leave a corridor\'s width between two rooms instead of shoving them flush. <b>0 is the intuitive reading of "maximum contact" and it is the wrong one</b> — see the panel above. Shipping value 2.2.'],
  ['cutSpan', 8, 60, 1, 'CUT — the warren vs the draw-call ceiling',
    'The longest a single corridor region may be before it is split into two. High = one huge hall the whole house opens onto, which is beautiful and blows the renderer. Low = a warren of short dark rooms. Shipping value 30 m, which is the gallery\'s own 27.2 m sightline plus a little.'],
  ['align', 0, 1, 0.05, 'ALIGN — free-form vs tidy',
    'Weight on placements that line an edge up with an edge already in the plan. You asked for free-form, and it turns out free-form is <i>better</i> for the corridors — misalignment is what creates the leftover space they are made of. Shipping value 0.35.'],
  ['waste', 0, 0.3, 0.01, 'WASTE — how compact the house has to be',
    'Penalty per square metre of bounding box the packer grows. Higher makes a tighter, blockier house. Shipping value 0.04.'],
];

function dials() {
  $('dials').innerHTML = DIALS.map(([k, lo, hi, st, title, why]) => `
    <div class="dial">
      <label>${title} <b id="v_${k}">${S.dials[k]}</b></label>
      <input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${st}" value="${S.dials[k]}">
      <div class="why">${why}</div>
    </div>`).join('');
  $('dials').querySelectorAll('input').forEach((el) => el.addEventListener('input', () => {
    S.dials[el.dataset.k] = Number(el.value);
    $(`v_${el.dataset.k}`).textContent = el.value;
    S.rooms = null; S.sel = -1;
    rebuild(); draw(); panels();
  }));
}

function library() {
  // to scale, so the five footprints can be compared by eye — which is the point
  const maxW = Math.max(...LIBRARY.map((l) => Math.max(l.w, l.d)));
  const px = 118 / maxW;
  $('library').innerHTML = LIBRARY.map((l) => `
    <div class="libitem">
      <span class="libsw" style="width:${(l.w * px).toFixed(0)}px;height:${(l.d * px).toFixed(0)}px;background:${ROOMC[l.type]}"></span>
      <span><b>${l.type}</b> ${l.w.toFixed(2)} × ${l.d.toFixed(2)} m<br>
      <span class="mut">${(l.w * l.d).toFixed(0)} m² · storey ${l.storey.toFixed(2)} m${l.type === 'study' ? ' · <b>appears twice</b>' : ''}</span></span>
    </div>`).join('');
}

// ===========================================================================================
// editing
// ===========================================================================================

function enterEdit() {
  if (!S.rooms) S.rooms = roomsFromPlan(S.plan);
}
function overlapping(list, k) {
  const a = list[k];
  for (let i = 0; i < list.length; i++) {
    if (i === k) continue;
    const b = list[i];
    if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 &&
        Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6) return true;
  }
  return false;
}
/** snap a dragged room to flush contact, or to one corridor stand-off, against its neighbours */
function snapRoom(list, k) {
  if (!S.snap) return;
  const a = list[k], T = 0.9, W = W_MIN + WALL_T;
  const cand = (v, t) => Math.abs(v - t) < T ? t : null;
  for (let i = 0; i < list.length; i++) {
    if (i === k) continue;
    const b = list[i];
    for (const t of [b.x1, b.x0 - (a.x1 - a.x0), b.x1 + W, b.x0 - (a.x1 - a.x0) - W, b.x0, b.x1 - (a.x1 - a.x0)]) {
      const s = cand(a.x0, t); if (s !== null) { const w = a.x1 - a.x0; a.x0 = s; a.x1 = s + w; break; }
    }
    for (const t of [b.z1, b.z0 - (a.z1 - a.z0), b.z1 + W, b.z0 - (a.z1 - a.z0) - W, b.z0, b.z1 - (a.z1 - a.z0)]) {
      const s = cand(a.z0, t); if (s !== null) { const d = a.z1 - a.z0; a.z0 = s; a.z1 = s + d; break; }
    }
  }
}
function hitRoom(wx, wz) {
  if (!S.rooms) return -1;
  for (let i = S.rooms.length - 1; i >= 0; i--) {
    const r = S.rooms[i];
    if (wx > r.x0 && wx < r.x1 && wz > r.z0 && wz < r.z1) return i;
  }
  return -1;
}
function hitHandle(px, py) {
  if (S.sel < 0 || !S.rooms || !S.rooms[S.sel]) return null;
  const r = S.rooms[S.sel];
  const cs = [['x0', 'z0'], ['x1', 'z0'], ['x0', 'z1'], ['x1', 'z1']];
  for (const [kx, kz] of cs) {
    if (Math.abs(SX(r[kx]) - px) < 7 && Math.abs(SY(r[kz]) - py) < 7) return [kx, kz];
  }
  return null;
}
function editWarn() {
  const cs = (S.rooms || []).filter((r) => r.custom).length;
  $('editWarn').innerHTML = !S.rooms ? ''
    : cs ? `<div class="verdict mid" style="font-size:11.5px">${cs} room${cs > 1 ? 's have' : ' has'} been
        <b>resized</b>. A resized room is a footprint that <b>does not exist in <code>spaces.js</code></b> —
        the game has five shapes and this is a sixth. Which is a completely reasonable thing to want, and
        it is the single highest-leverage thing you could ask for; it is just not free, so it is flagged
        rather than quietly exported.</div>`
      : `<div class="mut" style="font-size:11.5px">Hand-edited layout. Every number on this page is
         recomputed from your rectangles by the generator itself.</div>`;
}

function addRow() {
  $('addRow').innerHTML = LIBRARY.map((l) =>
    `<button data-t="${l.type}" style="padding:2px 6px;font-size:11px">${l.type}</button>`).join('');
  $('addRow').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    enterEdit(); S.edit = true; modeBtn();
    const L = LIBRARY.find((x) => x.type === b.dataset.t);
    const e = S.plan.env;
    const r = { type: L.type, rot: false, storey: L.storey, char: L.char, custom: false,
      x0: e.x1 + 2, x1: e.x1 + 2 + L.w + WALL_T, z0: e.z0, z1: e.z0 + L.d + WALL_T };
    S.rooms.push(r); S.sel = S.rooms.length - 1;
    rebuild(); fit(); draw(); panels(); editWarn();
    toast(`added a ${L.type} to the east — drag it where you want it`);
  }));
}

// ===========================================================================================
// export
// ===========================================================================================
/**
 * THE MAP FILE. `toJSON()` in the harness is the authority on the shape; this only adds the
 * provenance a consumer needs and the things that are true of an EDITED plan and not of a seed.
 */
function mapFile() {
  const j = toJSON(S.plan);
  return {
    format: 'rrr.map/1',
    generator: 'harness/genspike.mjs',
    /** ⚠️ §9.2: two clients on the same seed and DIFFERENT BUILDS derive different ids and the
     *  failure is a silent desync, not a crash. This must be part of the session handshake. */
    /** ⚠️ BUMPED 2026-08-11. `canDoor` moved from the boundary's SUMMED contact to its longest
     *  contiguous wall run, so some boundaries that used to carry a door no longer do. Same seed,
     *  different plan — which is exactly the silent-desync case above, so the version moves. */
    generatorVersion: 'genspike-2026-08-11',
    handEdited: !!S.rooms,
    customFootprints: (S.rooms || []).filter((r) => r.custom).length,
    dials: { ...S.dials },
    ...j,
  };
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ===========================================================================================
// 🚨 LABELS — the taste authority's verdicts, written to a real file in the repo
// ===========================================================================================
/**
 * `critic-corridor-1`: "the flat-plan fix is a scoring term and nobody has John's labels. This is
 * the highest-value thing in your tool and it may be the highest-value thing in the campaign."
 *
 * That is right, and it is worth being blunt about why. Every threshold in this project so far —
 * `W_MIN`, `--cut 30`, the flatness rule — was argued from geometry, and geometry cannot tell you
 * whether a house is worth being chased through. The generator's scoring function has a slot for
 * a term that says "and make it more like the ones he liked", and that term needs a training set
 * of exactly one person's opinion. One click writes one line. Fifty clicks is a data set.
 *
 * Failure is LOUD on purpose: a silently dropped verdict is worse than no button, because John
 * would keep clicking and get nothing.
 */
async function pushLabel(verdict) {
  const m = S.m, f = m.flat;
  const rec = {
    verdict,                                   // 'good' | 'meh' | 'bad'
    seed: S.seed,
    /**
     * 🚨 WHICH ARM PRODUCED THIS ROW. `'route-shown'` | `'route-hidden'`. The confound test in
     * `docs/handoff/maplabel-1.md` §5 is unrunnable without it, and it must survive forever.
     * **The original 40 rows carry NO `arm` field and are not migrated** — a missing `arm` means
     * `'route-shown'`, which is what they were. Read it as `row.arm ?? 'route-shown'`.
     */
    arm: ARM_TAG,
    handEdited: !!S.rooms,
    note: ($('vNote').value || '').trim() || undefined,
    dials: { ...S.dials },
    /**
     * 🐞 `storey` AND `char` ARE LOAD-BEARING AND WERE BEING DROPPED. Found by
     * `harness/_maplabel1-labels.mjs`'s provenance check. `planFromRooms` does `y1: r.storey`,
     * and every diggability test intersects that y range with the dig band — so a row rebuilt
     * without `storey` came back with `y1 === undefined`, every overlap went NaN, and the plan
     * had ZERO diggable edges: `digsToExit −1`, every room a dead end. It only bit HAND-EDITED
     * rows, because a seeded row is rebuilt from its seed and never from this list — which is
     * precisely why it went unnoticed, and precisely why the one hand-edited row in the set was
     * the one that could not be analysed. Row 88889 is already on disk without them and is
     * repaired at read time from `LIBRARY`; every row written from now on carries them.
     */
    // ⚠️ `S.rooms` when hand-edited — it is the only place `custom` lives (a resized footprint is
    // the editor's state, not the plan's) and it is literally the rectangles he dragged.
    // `roomsFromPlan` otherwise; both emit the `{type, rot, storey, char, custom, x0..z1}` shape
    // `planFromRooms` takes, so a row round-trips.
    rooms: (S.rooms || roomsFromPlan(S.plan)).map((r) => ({
      type: r.type, rot: !!r.rot, storey: r.storey, char: r.char, custom: !!r.custom,
      x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1,
    })),
    // the numbers as they stood when he looked at it, so a later scoring term can regress on them
    features: {
      depth: f.depth, crossedH: f.crossedH, crossedV: f.crossedV,
      depthMean: f.depthMean, aspect: f.aspect, rank2: f.rank2,
      nRooms: m.nRooms, nCorridors: m.nCorridors, nVoids: m.nVoids,
      sharedM: +m.sharedM.toFixed(2), diggableM: +m.diggableM.toFixed(2),
      fracInternalDiggable: +m.fracInternal.toFixed(4),
      corridorShare: +m.corridorShare.toFixed(4),
      envX: +(S.plan.env.x1 - S.plan.env.x0).toFixed(2),
      envZ: +(S.plan.env.z1 - S.plan.env.z0).toFixed(2),
      envFill: +m.fill.toFixed(4),
      sliverEdges: m.sliverEdges, alcoves: m.sliverRects,
      deadEndRooms: m.deadEndRooms, loops: m.difficulty.loops,
      corridorNetworks: m.corrNets, roomsOnCorridorFrac: +m.roomsOnCorridorFrac.toFixed(3),
      digsToExit: m.digsToExit, hopsToExit: m.hopsToExit,
      longestSightline: m.difficulty.longestSightline,
      biggestCorridorSpan: m.difficulty.biggestCorridorSpan,
      roomsOnBiggestCorridor: m.roomsOnBiggest,
      zeroDigPocketFrac: +S.pocket.frac.toFixed(4),
    },
  };
  try {
    const r = await fetch('/labels', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'server said no');
    await refreshLabels();
    toast(`seed ${S.seed}: ${verdict.toUpperCase()} — ${j.total} labelled so far`);
    $('vNote').value = '';
    setSeed((Number(S.seed) || 0) + 1);        // straight on to the next one
  } catch (e) {
    // LOUD. A dropped verdict is worse than no button.
    $('labelState').innerHTML = `<span class="bad">✗ NOT SAVED — ${e.message}.<br>
      The page must be open via <b>MAPS.bat</b> (http://localhost:5181/…) for verdicts to be
      written. If you opened the .html file directly, close it and use MAPS.bat.</span>`;
    toast('VERDICT NOT SAVED — see the panel');
  }
}
async function refreshLabels() {
  try {
    const r = await fetch('/labels');
    S.labels = await r.json();
  } catch { S.labels = null; }
  labelState();
}
function labelState() {
  const el = $('labelState');
  if (S.labels === null) {
    el.innerHTML = '<span class="bad">✗ cannot reach the labels file — open the tool via MAPS.bat</span>';
    return;
  }
  const n = S.labels.length;
  const mine = S.labels.filter((l) => String(l.seed) === String(S.seed));
  const tally = { good: 0, meh: 0, bad: 0 };
  for (const l of S.labels) if (tally[l.verdict] !== undefined) tally[l.verdict]++;
  // 🚨 the arm, right where his eye is when he decides — the banner is over the plan, this is
  // under the buttons, and both are re-rendered on every seed change
  const nArm = S.labels.filter((l) => (l.arm || 'route-shown') === ARM_TAG).length;
  el.innerHTML = `<div style="margin-bottom:5px;padding:3px 6px;border-radius:3px;${ROUTE_HIDDEN
    ? 'background:#2a0f30;border:1px solid var(--route);color:#e6c9ff'
    : 'background:#12161b;border:1px solid var(--line);color:var(--dim)'}">
      arm: <b>${ROUTE_HIDDEN ? 'ROUTE HIDDEN' : 'route shown'}</b> — ${nArm} row${nArm === 1 ? '' : 's'}
      recorded in this arm${ROUTE_HIDDEN ? '' : ' <span class="mut">(H to hide it)</span>'}</div>
    <b>${n}</b> labelled so far —
    <span class="gd">${tally.good} good</span> ·
    <span style="color:#ffdf9a">${tally.meh} meh</span> ·
    <span class="bad">${tally.bad} bad</span>
    ${mine.length ? `<br>you already called seed ${S.seed} <b>${mine[mine.length - 1].verdict.toUpperCase()}</b> — clicking again just supersedes it` : ''}
    ${n >= 30 ? '<br><span class="gd">that is enough to fit a scoring term on. Tell Claude.</span>'
      : n >= 1 ? `<br><span class="mut">about ${30 - n} more and a scoring term becomes fittable</span>` : ''}`;
}

// ===========================================================================================
// saved layouts
// ===========================================================================================
const LS = 'rrr.mapdesigner.saved';
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
function renderSaved() {
  const arr = loadSaved();
  $('saved').innerHTML = !arr.length ? '<span class="mut" style="font-size:11.5px">nothing saved yet</span>'
    : arr.map((s, i) => `<div class="row" style="margin-bottom:3px">
        <button data-i="${i}" class="ld" style="padding:2px 7px;font-size:11px">${s.name}</button>
        <button data-i="${i}" class="rm" style="padding:2px 6px;font-size:11px">×</button></div>`).join('');
  $('saved').querySelectorAll('.ld').forEach((b) => b.addEventListener('click', () => {
    const s = loadSaved()[+b.dataset.i];
    S.seed = s.seed; S.dials = { ...s.dials }; S.rooms = s.rooms.map((r) => ({ ...r }));
    $('seed').value = S.seed; dials();
    rebuild(); fit(); draw(); panels(); editWarn();
    toast(`loaded "${s.name}"`);
  }));
  $('saved').querySelectorAll('.rm').forEach((b) => b.addEventListener('click', () => {
    const arr2 = loadSaved(); arr2.splice(+b.dataset.i, 1);
    localStorage.setItem(LS, JSON.stringify(arr2)); renderSaved();
  }));
}

// ===========================================================================================
// wiring
// ===========================================================================================

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2600);
}
/**
 * 🚨 ONE ACTION TO ENTER THE ARM, AND THE STATE IS ON SCREEN WHILE HE LABELS.
 *
 * The toggle RELOADS with `?arm=blind` rather than redrawing, so the arm is always exactly what
 * the URL says and can never drift out of step with what the label rows record. The seed rides
 * along, so he does not lose his place. `H`, the header button, and the URL are the same action.
 */
function setArm(hidden) {
  const q = new URLSearchParams(location.search);
  if (hidden) q.set('arm', 'blind'); else q.delete('arm');
  q.set('seed', String(S.seed));
  location.search = q.toString();
}
function armUI() {
  const b = $('armBtn');
  b.textContent = ROUTE_HIDDEN ? 'route: HIDDEN' : 'route: shown';
  b.classList.toggle('armon', ROUTE_HIDDEN);
  const ban = $('armBanner');
  ban.classList.toggle('on', ROUTE_HIDDEN);
  ban.innerHTML = ROUTE_HIDDEN
    ? '<b>ROUTE HIDDEN</b> — judge the house on its own. The way in, the way out and the walls are '
      + 'all still here; only the line telling you the answer is gone. <b>Press H to bring it back.</b>'
    : '';
}
function modeBtn() {
  $('modeBtn').textContent = `edit: ${S.edit ? 'ON' : 'off'}`;
  $('modeBtn').classList.toggle('on', S.edit);
  cv.classList.toggle('edit', S.edit);
  hint();
}
function hint() {
  $('hint').innerHTML = S.edit
    ? 'EDIT — <b>drag</b> a room to move it · drag a white <b>corner</b> to resize (that invents a new footprint) · <b>R</b> rotate · <b>Del</b> delete · <b>E</b> leave edit mode'
    : '<b>←</b> / <b>→</b> seed · <b>R</b> random · <b>E</b> edit · <b>F</b> fit · <b>H</b> '
      + (ROUTE_HIDDEN ? 'show the route again' : 'hide the route') + ' · wheel to zoom, drag to pan';
}
function setSeed(v) {
  S.seed = v; S.rooms = null; S.sel = -1;
  $('seed').value = v;
  rebuild(); fit(); draw(); panels(); editWarn(); labelState();
}

$('armBtn').onclick = () => setArm(!ROUTE_HIDDEN);

$('vGood').onclick = () => pushLabel('good');
$('vMeh').onclick = () => pushLabel('meh');
$('vBad').onclick = () => pushLabel('bad');

$('prev').onclick = () => setSeed(Math.max(0, (Number(S.seed) || 0) - 1));
$('next').onclick = () => setSeed((Number(S.seed) || 0) + 1);
$('rand').onclick = () => setSeed(Math.floor(Math.random() * 100000));
$('seed').onchange = () => { const v = $('seed').value.trim(); setSeed(isNaN(Number(v)) ? v : Number(v)); };
$('fit').onclick = () => { fit(); draw(); };
$('modeBtn').onclick = () => { S.edit = !S.edit; if (S.edit) enterEdit(); modeBtn(); draw(); editWarn(); };
$('resetDials').onclick = () => { S.dials = { ...S.DEFAULTS }; dials(); S.rooms = null; rebuild(); draw(); panels(); };
$('revert').onclick = () => { S.rooms = null; S.sel = -1; rebuild(); fit(); draw(); panels(); editWarn(); toast('back to the generated plan'); };
$('snap').onchange = (e) => { S.snap = e.target.checked; };
$('rotBtn').onclick = () => rotateSel();
$('delBtn').onclick = () => delSel();
$('shot').onclick = () => {
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png');
  a.download = `rrr-plan-seed-${S.seed}${S.rooms ? '-edited' : ''}.png`; a.click();
};
$('exp').onclick = () => {
  download(`rrr-map-seed-${S.seed}${S.rooms ? '-edited' : ''}.json`, JSON.stringify(mapFile(), null, 1));
  toast('downloaded — it is in your Downloads folder');
};
$('expShow').onclick = () => {
  const el = $('jsonOut');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  el.textContent = JSON.stringify(mapFile(), null, 1);
};
$('save').onclick = () => {
  enterEdit();
  const name = prompt('name this layout', `seed ${S.seed}${S.rooms ? ' edited' : ''}`);
  if (!name) return;
  const arr = loadSaved();
  arr.push({ name, seed: S.seed, dials: { ...S.dials }, rooms: S.rooms.map((r) => ({ ...r })) });
  localStorage.setItem(LS, JSON.stringify(arr)); renderSaved(); toast(`saved "${name}"`);
};

function rotateSel() {
  if (S.sel < 0) { toast('select a room first (press E, then click one)'); return; }
  enterEdit();
  const r = S.rooms[S.sel];
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const w = r.z1 - r.z0, d = r.x1 - r.x0;
  r.x0 = cx - w / 2; r.x1 = cx + w / 2; r.z0 = cz - d / 2; r.z1 = cz + d / 2;
  r.rot = !r.rot;
  if (overlapping(S.rooms, S.sel)) { rotateBack(r, cx, cz); toast('cannot rotate — it would overlap'); return; }
  rebuild(); draw(); panels();
}
function rotateBack(r, cx, cz) {
  const w = r.z1 - r.z0, d = r.x1 - r.x0;
  r.x0 = cx - w / 2; r.x1 = cx + w / 2; r.z0 = cz - d / 2; r.z1 = cz + d / 2; r.rot = !r.rot;
}
function delSel() {
  if (S.sel < 0) return;
  enterEdit();
  if (S.rooms.length <= 2) { toast('a house needs more than two rooms'); return; }
  S.rooms.splice(S.sel, 1); S.sel = -1;
  rebuild(); draw(); panels(); editWarn();
}

// --- pointer ---------------------------------------------------------------------------------
cv.addEventListener('pointerdown', (ev) => {
  cv.setPointerCapture(ev.pointerId);
  const px = ev.offsetX, py = ev.offsetY;
  if (S.edit) {
    const h = hitHandle(px, py);
    if (h) { S.drag = { kind: 'resize', h, i: S.sel, snap: { ...S.rooms[S.sel] } }; return; }
    const i = hitRoom(WX(px), WZ(py));
    if (i >= 0) {
      S.sel = i;
      S.drag = { kind: 'room', i, ox: WX(px) - S.rooms[i].x0, oz: WZ(py) - S.rooms[i].z0, before: { ...S.rooms[i] } };
      draw(); return;
    }
    S.sel = -1; draw();
  }
  S.drag = { kind: 'pan', px, py, ox: S.view.ox, oz: S.view.oz };
  cv.classList.add('dragging');
});
cv.addEventListener('pointermove', (ev) => {
  if (!S.drag) return;
  const px = ev.offsetX, py = ev.offsetY;
  if (S.drag.kind === 'pan') {
    S.view.ox = S.drag.ox - (px - S.drag.px) / S.view.s;
    S.view.oz = S.drag.oz - (py - S.drag.py) / S.view.s;
    draw(); return;
  }
  const r = S.rooms[S.drag.i];
  if (S.drag.kind === 'room') {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    r.x0 = Math.round((WX(px) - S.drag.ox) * 20) / 20; r.x1 = r.x0 + w;
    r.z0 = Math.round((WZ(py) - S.drag.oz) * 20) / 20; r.z1 = r.z0 + d;
    snapRoom(S.rooms, S.drag.i);
  } else {
    const wx = Math.round(WX(px) * 10) / 10, wz = Math.round(WZ(py) * 10) / 10;
    const [kx, kz] = S.drag.h;
    if (kx === 'x0') r.x0 = Math.min(wx, r.x1 - 1.2); else r.x1 = Math.max(wx, r.x0 + 1.2);
    if (kz === 'z0') r.z0 = Math.min(wz, r.z1 - 1.2); else r.z1 = Math.max(wz, r.z0 + 1.2);
    r.custom = true;
  }
  if (overlapping(S.rooms, S.drag.i)) { S.drag.bad = true; draw(); markBad(r); return; }
  S.drag.bad = false;
  rebuild({ light: true }); draw(); panels();
});
function markBad(r) {
  ctx.strokeStyle = C.warn; ctx.lineWidth = 3;
  ctx.strokeRect(SX(r.x0), SY(r.z0), (r.x1 - r.x0) * S.view.s, (r.z1 - r.z0) * S.view.s);
  label(SX((r.x0 + r.x1) / 2), SY((r.z0 + r.z1) / 2) - 24, 'OVERLAP', C.warn, 12, true);
}
cv.addEventListener('pointerup', () => {
  if (S.drag && S.drag.bad) {
    Object.assign(S.rooms[S.drag.i], S.drag.before || S.drag.snap);
    toast('rooms cannot overlap — put back');
  }
  const wasEdit = S.drag && S.drag.kind !== 'pan';
  S.drag = null; cv.classList.remove('dragging');
  if (wasEdit) { rebuild(); draw(); panels(); editWarn(); }
});
cv.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const wx = WX(ev.offsetX), wz = WZ(ev.offsetY);
  S.view.s *= ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  S.view.s = Math.max(1.2, Math.min(120, S.view.s));
  S.view.ox = wx - ev.offsetX / S.view.s;
  S.view.oz = wz - ev.offsetY / S.view.s;
  draw();
}, { passive: false });

window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA') return;
  const k = ev.key;
  if (k === 'ArrowRight') { setSeed((Number(S.seed) || 0) + 1); ev.preventDefault(); }
  else if (k === 'ArrowLeft') { setSeed(Math.max(0, (Number(S.seed) || 0) - 1)); ev.preventDefault(); }
  else if (k === 'e' || k === 'E') { S.edit = !S.edit; if (S.edit) enterEdit(); modeBtn(); draw(); editWarn(); }
  else if (k === 'f' || k === 'F') { fit(); draw(); }
  else if (k === 'h' || k === 'H') { setArm(!ROUTE_HIDDEN); }
  else if (k === 'r' || k === 'R') { S.edit ? rotateSel() : setSeed(Math.floor(Math.random() * 100000)); }
  else if (k === 'Delete' || k === 'Backspace') { if (S.edit) delSel(); }
  else if (k === '1') pushLabel('good');
  else if (k === '2') pushLabel('meh');
  else if (k === '3') pushLabel('bad');
});
window.addEventListener('resize', () => { resize(); draw(); drawStrip(); });

// ===========================================================================================
// go
// ===========================================================================================
// `?seed=N` so a link can point at one plan — used by the control arm's own link, and by anyone
// sending "look at this house" to someone else.
{
  const qs = new URLSearchParams(location.search);
  if (qs.has('seed')) { const v = qs.get('seed').trim(); S.seed = isNaN(Number(v)) ? v : Number(v); }
}
$('seed').value = S.seed;
legend(); toggles(); dials(); library(); addRow(); renderSaved(); modeBtn(); armUI();
resize();
rebuild();
fit();
draw();
panels();
editWarn();
refreshLabels();

// a one-line sanity line in the console, so a broken import is obvious rather than silent
console.log('%cmap designer', 'color:#ff9a3c', '· generator: /harness/genspike.mjs ·',
  `L_DIG ${L_DIG} · L_DOOR ${L_DOOR.toFixed(2)} · DIG_H ${DIG_H} · W_MIN ${W_MIN} · spans ${AUTHORED_SPANS.join('/')}`,
  `· arm ${ARM_TAG}`);

/**
 * Debug handle. The tool is a diagnostic instrument, so being able to interrogate its state from
 * the console (or from a Playwright probe) is part of the job rather than a leftover.
 */
window.__mapdesigner = S;
