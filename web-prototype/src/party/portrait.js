/**
 * 🖼️ **BEHIND THE PORTRAIT — station gallery play.**
 *
 * `docs/slices/task-guide-runner-follow-on.md`. Two pullers raise a shared drum with
 * alternating rhythm pulses; crossers crawl under when the lift is high enough; a far-side
 * catch locks the panel. Phones are station controllers. The TV is lift / noise / hunter —
 * never a god-map, never Guide E / Runner D / auto-walk / pin.
 *
 * Escape contribution: catch locked AND at least one successful cross (LHL shape).
 * Sabotage is the same controls used at the wrong moment (double-pull, crawl too early).
 *
 * ⚠️ **IMPORTS NOTHING**, so a node gate executes the shipped functions. Same bargain as
 * `heat.js` / `runner-intel.js`.
 *
 * No THREE, no DOM (chrome helpers below are strings only).
 */

export const PORTRAIT_JOB = 'portrait';

export const PORTRAIT_STEP = Object.freeze({
  IDLE: 'idle',
  PRACTICE: 'practice',
  PLAY: 'play',
});

/** Partner pulse inside this window completes a stroke. */
export const RHYTHM_MS = 900;

/** One alternating A↔B stroke. */
export const STROKE_LIFT = 0.14;

/** Same-side twice, or a pulse that dies waiting. Recoverable. */
export const SLIP_LIFT = 0.08;

/** Gravity while nobody is stroking. */
export const LIFT_FALL = 0.03;

/** Lift needed to start / finish a crawl. */
export const CRAWL_NEED = 0.55;

/** Hold ~2.5 s under a raised panel. */
export const CRAWL_RATE = 0.40;

export const HUNTER_SLIP = 0.05;
export const NOISE_SLIP = 0.35;
export const NOISE_STROKE = 0.12;
export const NOISE_FALL = 0.10;

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function isPortraitJob(id) {
  return id === PORTRAIT_JOB;
}

export function freshPortraitSeat(station = null) {
  return {
    station: station || null,
    pulling: false,
    crawling: false,
    crawl: 0,
    crossed: false,
    catching: false,
  };
}

export function freshPortraitBoard() {
  return {
    lift: 0,
    noise: 0,
    hunterPressure: 0,
    catchLocked: false,
    crosses: 0,
    lastPull: null,
    slips: 0,
  };
}

/** Public projection — lift / noise / hunter / catch. No rhythm, no crawl progress. */
export function projectPortrait(board = {}, { step = PORTRAIT_STEP.IDLE, seats = {} } = {}) {
  const stations = Object.keys(seats).map((id) => {
    const s = seats[id] || {};
    return {
      id: String(id),
      station: s.station || null,
      busy: !!(s.pulling || s.crawling),
    };
  });
  return {
    step,
    lift: clamp01(board.lift),
    noise: clamp01(board.noise),
    hunterPressure: clamp01(board.hunterPressure),
    catchLocked: !!board.catchLocked,
    crosses: Math.max(0, board.crosses | 0),
    stations,
  };
}

/** Keys that would leak individual timing if they rode the public board. */
export function portraitLeaks(board) {
  const bad = [];
  const walk = (node, prefix) => {
    if (node == null || typeof node !== 'object') return;
    for (const k of Object.keys(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (k === 'lastPull' || k === 'crawl' || k === 'slips' || k === 'pulling' || k === 'crawling') {
        bad.push(path);
      }
      walk(node[k], path);
    }
  };
  walk(board, '');
  return bad;
}

export function portraitSuccess(board = {}) {
  return !!(board.catchLocked && (board.crosses | 0) >= 1);
}

function otherPull(station) {
  if (station === 'pull-a') return 'pull-b';
  if (station === 'pull-b') return 'pull-a';
  return null;
}

function slip(board, nowMs) {
  const next = { ...board };
  next.lift = clamp01(next.lift - SLIP_LIFT);
  next.noise = clamp01(Math.max(next.noise, NOISE_SLIP));
  next.hunterPressure = clamp01(next.hunterPressure + HUNTER_SLIP);
  next.slips = (next.slips | 0) + 1;
  next.lastPull = null;
  next.slippedAt = Number(nowMs) || 0;
  return next;
}

/**
 * One rhythm pulse from a puller. Alternating A↔B inside `RHYTHM_MS` raises the drum.
 * Same-side twice is a slip. A lone pulse waits; `tickPortrait` times it out.
 */
export function pulsePull(board, seat, { nowMs = 0, playerId = null } = {}) {
  const station = seat?.station;
  if (station !== 'pull-a' && station !== 'pull-b') {
    return { ok: false, why: 'not puller', board, seat };
  }
  const nextSeat = { ...freshPortraitSeat(station), ...seat, pulling: true };
  const last = board?.lastPull;
  const t = Number(nowMs) || 0;
  if (last && last.station === otherPull(station) && (t - (Number(last.at) || 0)) <= RHYTHM_MS) {
    const next = { ...freshPortraitBoard(), ...board };
    next.lift = clamp01(next.lift + STROKE_LIFT);
    next.noise = clamp01(Math.max(next.noise, NOISE_STROKE));
    next.lastPull = null;
    next.strokedAt = t;
    return { ok: true, stroke: true, board: next, seat: nextSeat };
  }
  if (last && last.station === station) {
    return { ok: true, stroke: false, board: slip({ ...freshPortraitBoard(), ...board }, t), seat: nextSeat };
  }
  const next = { ...freshPortraitBoard(), ...board };
  next.lastPull = { station, at: t, id: playerId || null };
  return { ok: true, stroke: false, board: next, seat: nextSeat };
}

export function setCrawling(seat, on, board = {}) {
  const next = { ...freshPortraitSeat(), ...seat };
  const lift = clamp01(board.lift);
  if (!on) {
    next.crawling = false;
    return { ok: true, seat: next };
  }
  if (next.crossed) return { ok: true, seat: { ...next, crawling: false } };
  if (lift < CRAWL_NEED && !(next.crawl > 0)) {
    return { ok: false, why: 'lift low', seat: next };
  }
  next.crawling = true;
  return { ok: true, seat: next };
}

/**
 * Far-side catch. Needs a successful cross on this seat and lift still high enough
 * to pin the panel.
 */
export function catchPortrait(seat, board = {}) {
  const nextSeat = { ...freshPortraitSeat(), ...seat };
  if (!nextSeat.crossed) return { ok: false, why: 'not crossed', seat: nextSeat, board };
  if (clamp01(board.lift) < CRAWL_NEED) return { ok: false, why: 'lift low', seat: nextSeat, board };
  const next = { ...freshPortraitBoard(), ...board, catchLocked: true };
  nextSeat.catching = true;
  return { ok: true, seat: nextSeat, board: next };
}

/**
 * One tick. `dt` is seconds. Gravity, crawl progress, waiting-pulse timeout, noise fade.
 * A crawl that loses lift mid-way knocks (slip) and resets crawl progress.
 */
export function tickPortrait({
  seats = {},
  board = {},
  nowMs = 0,
  dt = 0,
} = {}) {
  const step = Math.max(0, Number(dt) || 0);
  const t = Number(nowMs) || 0;
  let nextBoard = { ...freshPortraitBoard(), ...board };
  const nextSeats = {};

  if (nextBoard.lastPull && (t - (Number(nextBoard.lastPull.at) || 0)) > RHYTHM_MS) {
    nextBoard = slip(nextBoard, t);
  }

  nextBoard.lift = clamp01(nextBoard.lift - LIFT_FALL * step);
  nextBoard.noise = clamp01(nextBoard.noise - NOISE_FALL * step);

  for (const id of Object.keys(seats)) {
    const seat = { ...freshPortraitSeat(), ...seats[id] };
    if (seat.crawling && !seat.crossed) {
      if (nextBoard.lift < CRAWL_NEED) {
        seat.crawling = false;
        seat.crawl = 0;
        nextBoard = slip(nextBoard, t);
      } else {
        seat.crawl = clamp01(seat.crawl + CRAWL_RATE * step);
        if (seat.crawl >= 1) {
          seat.crawl = 1;
          seat.crawling = false;
          seat.crossed = true;
          nextBoard.crosses = (nextBoard.crosses | 0) + 1;
        }
      }
    }
    if (!seat.crawling && !seat.pulling) {
      /* pull flash is one tick; clear so TV busy flags do not stick */
    }
    if (seat.pulling) seat.pulling = false;
    nextSeats[id] = seat;
  }

  return { board: nextBoard, seats: nextSeats };
}

/** Phone pad for the claimed station. Same verbs for goods and saboteurs. */
export function portraitPadHtml(you = {}, portrait = {}) {
  const station = you.station || 'cross';
  const lift = Math.round(clamp01(portrait.lift) * 100);
  const liftLine = `<p class="portrait-lift" data-portrait-lift>Lift ${lift}%</p>`;
  if (station === 'pull-a' || station === 'pull-b') {
    return `<div class="portrait-pad" data-portrait-pad data-station="${esc(station)}">
      <h1>Pull.</h1>
      <p class="hint">Pulse down. Alternate with the other puller. Same-side twice slips.</p>
      ${liftLine}
      <button type="button" class="btn wide portrait-pull" data-portrait-pull="1">PULL</button>
    </div>`;
  }
  const crawlBtn = you.crossed
    ? ''
    : `<button type="button" class="btn wide portrait-crawl" data-portrait-crawl="1">HOLD TO CRAWL</button>
       <p class="hint">Needs the portrait up. Release if it slips.</p>`;
  const catchBtn = you.crossed && !portrait.catchLocked
    ? `<button type="button" class="btn wide" data-portrait-catch="1">CATCH AND LOCK</button>`
    : '';
  const locked = portrait.catchLocked
    ? `<p class="cast-note">Catch locked. ${portrait.crosses | 0} through.</p>`
    : '';
  const crossed = you.crossed
    ? `<p class="cast-note">You are through. Lock it from this side.</p>`
    : '';
  return `<div class="portrait-pad" data-portrait-pad data-station="${esc(station)}">
    <h1>Cross.</h1>
    <p class="hint">Crawl under while they hold it up. Catch on the far side.</p>
    ${liftLine}
    ${crossed}
    ${crawlBtn}
    ${catchBtn}
    ${locked}
  </div>`;
}

/** TV gallery spectacle — lift, noise, hunter. No map, no pin, no timing. */
export function galleryBoardHtml(portrait = {}) {
  const lift = Math.round(clamp01(portrait.lift) * 100);
  const noise = Math.round(clamp01(portrait.noise) * 100);
  const hunt = Math.round(clamp01(portrait.hunterPressure) * 100);
  const catchLine = portrait.catchLocked ? 'LOCKED' : 'open';
  const busy = (portrait.stations || []).filter((s) => s.busy).length;
  return `<section class="gallery-board" data-gallery-board>
    <p class="gallery-k">Gallery</p>
    <p class="gallery-lift" data-gallery-lift>Lift <span>${lift}%</span></p>
    <div class="gallery-bar" data-gallery-bar aria-valuenow="${lift}"><i style="width:${lift}%"></i></div>
    <p class="gallery-noise" data-gallery-noise>Noise ${noise}%</p>
    <p class="gallery-hunt" data-gallery-hunt>Hunter ${hunt}%</p>
    <p class="gallery-catch" data-gallery-catch>Catch ${esc(catchLine)} · ${portrait.crosses | 0} through</p>
    <p class="gallery-busy">${busy} working</p>
  </section>`;
}
