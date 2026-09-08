/**
 * 🔥 **PRIVATE-HEAT — the honest-struggle cover on a Lights / generator job.**
 *
 * `docs/slices/task-private-heat.md`. Every participating robot runs a generator. HOLD raises
 * private heat and contributes public output; RELEASE cools and drops that seat's bar. Heat at
 * 1.0 forces a ~4.5 s trip. The TV sees output / reserve / gate / floodlights — never heat.
 *
 * ⚠️ **IMPORTS NOTHING**, so a node gate executes the shipped functions. Same bargain as
 * `runner-intel.js`. Rates are tuneable; the public/private split and the trip are not.
 *
 * No THREE, no DOM (chrome helpers below are strings only).
 */

export const HEAT_TRIP_MS = 4500;

/** Hold ~8.3 s to trip if never released. */
export const HEAT_RISE = 0.12;

/** Release cools faster than hold heats — staggered breaks stay viable. */
export const HEAT_FALL = 0.22;

/** Trip dumps heat so the station comes back cool-ish. */
export const HEAT_TRIP_FALL = 0.18;

/** Combined output at this rate fills the reserve in ~12.5 s. */
export const RESERVE_CHARGE = 0.08;

/** Multi-drop drains faster than a staggered break — that is the social cost. */
export const RESERVE_DRAIN = 0.16;

/** Hunter pressure while floodlights are down. Floodlights stall; they never retreat. */
export const HUNTER_ADVANCE = 0.05;

export const LIGHTS_JOB = 'lights';
export const GENERATOR_STATION = 'generator';

export const HEAT_STEP = Object.freeze({
  IDLE: 'idle',
  PRACTICE: 'practice',
  PLAY: 'play',
});

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

/** Need all-but-one so one seat can cool. One living still has to hold. */
export function neededOutput(livingCount) {
  const n = Math.max(0, livingCount | 0);
  if (n <= 0) return 0;
  return Math.max(1, n - 1);
}

export function freshSeat() {
  return { heat: 0, generating: false, tripUntil: 0, crossed: false };
}

export function tripLeft(seat, nowMs) {
  const left = (Number(seat?.tripUntil) || 0) - (Number(nowMs) || 0);
  return left > 0 ? left : 0;
}

export function isTripped(seat, nowMs) {
  return tripLeft(seat, nowMs) > 0;
}

export function outputOf(seat, nowMs) {
  if (!seat) return 0;
  if (isTripped(seat, nowMs)) return 0;
  return seat.generating ? 1 : 0;
}

/**
 * HOLD / RELEASE. A tripped station cannot start generating. Same control for goods
 * and saboteurs — there is no saboteur-only verb.
 */
export function setGenerating(seat, on, nowMs) {
  const next = { ...freshSeat(), ...(seat || {}) };
  const t = Number(nowMs) || 0;
  if (isTripped(next, t)) {
    next.generating = false;
    return { ...next, output: 0 };
  }
  next.generating = !!on;
  return { ...next, output: outputOf(next, t) };
}

/**
 * One seat, one tick. `dt` is seconds. `grace` freezes heat and holds (reconnect);
 * a fresh press is required after grace — see `endGrace`.
 */
export function tickSeat(seat, { dt = 0, nowMs = 0, grace = false } = {}) {
  const next = { ...freshSeat(), ...(seat || {}) };
  const t = Number(nowMs) || 0;
  const step = Math.max(0, Number(dt) || 0);

  if (grace) return { ...next, output: outputOf(next, t) };

  if (next.heat >= 1 && !isTripped(next, t)) {
    next.tripUntil = t + HEAT_TRIP_MS;
    next.generating = false;
  }

  if (isTripped(next, t)) {
    next.generating = false;
    next.heat = clamp01(next.heat - HEAT_TRIP_FALL * step);
  } else if (next.generating) {
    next.heat = clamp01(next.heat + HEAT_RISE * step);
    if (next.heat >= 1) {
      next.heat = 1;
      next.tripUntil = t + HEAT_TRIP_MS;
      next.generating = false;
    }
  } else {
    next.heat = clamp01(next.heat - HEAT_FALL * step);
  }

  return { ...next, output: outputOf(next, t) };
}

/** Grace ending drops every hold so a reconnect is not a silent generate. */
export function endGrace(seat) {
  const next = { ...freshSeat(), ...(seat || {}) };
  next.generating = false;
  return next;
}

/**
 * Shared board. Sufficient combined output charges the reserve and holds floodlights.
 * Insufficient drains the reserve and lets hunter pressure advance. Restored floodlights
 * stall the hunter where it stands — they do not push it back.
 */
export function tickBoard({
  seats = {},
  reserve = 0,
  hunterPressure = 0,
  nowMs = 0,
  dt = 0,
  livingCount = null,
} = {}) {
  const step = Math.max(0, Number(dt) || 0);
  const ids = Object.keys(seats);
  const n = livingCount != null ? (livingCount | 0) : ids.length;
  const need = neededOutput(n);
  let power = 0;
  const stations = [];
  for (const id of ids) {
    const out = outputOf(seats[id], nowMs);
    power += out;
    stations.push({ id, output: out });
  }
  const sufficient = need > 0 && power >= need;
  const floodlit = sufficient;
  const nextReserve = sufficient
    ? clamp01(reserve + RESERVE_CHARGE * step)
    : clamp01(reserve - RESERVE_DRAIN * step);
  const gateOpen = nextReserve >= 1;
  const pressure = floodlit
    ? clamp01(hunterPressure)
    : clamp01(hunterPressure + HUNTER_ADVANCE * step);
  return {
    stations,
    power,
    needed: need,
    reserve: nextReserve,
    gateOpen,
    floodlit,
    hunterPressure: pressure,
  };
}

/** Public projection — output / progress only. Heat never belongs here. */
export function projectLights(board = {}, { step = HEAT_STEP.IDLE } = {}) {
  return {
    step,
    stations: (board.stations || []).map((s) => ({
      id: String(s.id),
      output: s.output ? 1 : 0,
    })),
    power: board.power | 0,
    needed: board.needed | 0,
    reserve: clamp01(board.reserve),
    gateOpen: !!board.gateOpen,
    floodlit: !!board.floodlit,
    hunterPressure: clamp01(board.hunterPressure),
  };
}

/** Keys that would kill the honest-struggle cover if they rode the public board. */
export function lightsLeaks(board) {
  const bad = [];
  const walk = (node, prefix) => {
    if (node == null || typeof node !== 'object') return;
    for (const k of Object.keys(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (k === 'heat' || k === 'tripLeft' || k === 'tripUntil') {
        bad.push(path);
      }
      walk(node[k], path);
    }
  };
  walk(board, '');
  return bad;
}

/**
 * Gate is open: a seat may drop the generator and cross. Anyone may keep generating
 * to buy slower teammates time. No permanent volunteer sacrifice.
 */
export function leaveGenerator(seat, gateOpen) {
  if (!gateOpen) return { ok: false, why: 'gate shut', seat: seat || freshSeat() };
  return {
    ok: true,
    seat: { ...freshSeat(), ...(seat || {}), generating: false, crossed: true },
  };
}

export function isLightsJob(id) {
  return id === LIGHTS_JOB;
}

/** Phone private dial + HOLD TO GENERATE. Same control for every seat. */
export function generatePadHtml(you = {}, lights = {}) {
  const heat = clamp01(you.heat);
  const left = Number(you.tripLeft) || 0;
  const tripped = left > 0;
  const pct = Math.round(heat * 100);
  const tripLine = tripped
    ? `<p class="heat-trip" data-heat-trip>Generator tripped — cooling…</p>`
    : '';
  const hold = tripped
    ? ''
    : `<button type="button" class="btn wide heat-hold" data-generate="1">HOLD TO GENERATE</button>
       <p class="hint">Release to cool. Same hold as everyone else.</p>`;
  const cross = lights.gateOpen
    ? `<button type="button" class="btn wide" data-heat-cross="1">Cross the gate</button>`
    : '';
  return `<div class="heat-pad" data-heat-pad>
    <h1>Keep the Lights On.</h1>
    <p class="hint">HOLD TO GENERATE. Release to cool.</p>
    <div class="heat-dial" data-heat-dial aria-valuenow="${pct}">
      <span class="heat-dial-k">Heat</span>
      <span class="heat-dial-bar"><i style="width:${pct}%"></i></span>
      <span class="heat-dial-n" data-heat-n>${pct}%</span>
    </div>
    ${tripLine}
    ${hold}
    ${cross}
  </div>`;
}

/** TV public board — stations, combined power, reserve, gate, floodlights. No heat. */
export function lightsBoardHtml(lights = {}) {
  const stations = (lights.stations || []).map((s) => {
    const on = s.output ? ' on' : '';
    return `<li class="lights-st${on}" data-station-out="${esc(s.id)}">${esc(s.id)} · ${s.output ? 'ON' : 'off'}</li>`;
  }).join('');
  const pct = Math.round(clamp01(lights.reserve) * 100);
  const hunt = Math.round(clamp01(lights.hunterPressure) * 100);
  const gate = lights.gateOpen ? 'OPEN' : 'shut';
  const flood = lights.floodlit ? 'ON' : 'down';
  return `<section class="lights-board" data-lights-board>
    <p class="lights-k">Hall power</p>
    <p class="lights-power" data-lights-power>${lights.power | 0} / ${lights.needed | 0}</p>
    <ul class="lights-stations">${stations}</ul>
    <p class="lights-reserve">Reserve <span data-lights-reserve>${pct}%</span></p>
    <p class="lights-gate" data-lights-gate>Gate ${esc(gate)}</p>
    <p class="lights-flood" data-lights-flood>Floodlights ${esc(flood)}</p>
    <p class="lights-hunt" data-lights-hunt>Hunter ${hunt}%</p>
  </section>`;
}
