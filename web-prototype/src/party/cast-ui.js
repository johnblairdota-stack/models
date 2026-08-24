/**
 * Sequential casting on the phone. Highlight is not a vote; the padlock is.
 * The wire is still one complete public ballot: { voter, runner, guide }.
 */

import { castLockoutId } from './ballot.js';

export function freshCast() {
  return { phase: 'runner', draft: null, runner: null, guide: null };
}

/** Episode 1 says "first"; later episodes use the real number. */
export function castPrompt(slot, episode = 1) {
  const ep = Number(episode) || 1;
  if (slot === 'runner') {
    return ep === 1
      ? 'You are picking a runner for the first expedition.'
      : `You are picking a runner for expedition ${ep}.`;
  }
  return 'Now pick a guide for this expedition.';
}

export function applyCastTap(cast, playerId) {
  const cur = cast || freshCast();
  if (!playerId || cur.phase === 'sent') return cur;
  if (cur.phase === 'guide' && playerId === cur.runner) return cur;
  if (cur.draft === playerId) return cur;
  return { ...cur, draft: playerId };
}

/**
 * Why this name is not a vote. Rotation lockout matches `castLockoutId` /
 * `tallyCasting` (one-way, void below four). Same-chair is the sequential padlock
 * rule. Self-picks are NOT blocked here — the server decides that; the phone
 * only has to show the state.
 */
export function castRowBlock(playerId, cast, { lastPair, livingCount } = {}) {
  const cur = cast || freshCast();
  if (!playerId || cur.phase === 'sent') return null;
  if (cur.phase === 'guide' && playerId === cur.runner) return 'runner';
  const slot = cur.phase === 'guide' ? 'guide' : 'runner';
  if (castLockoutId(lastPair, livingCount, slot) === playerId) {
    return slot === 'guide' ? 'guided' : 'ran';
  }
  return null;
}

export const CAST_BLOCK_WHY = {
  runner: 'Already the runner — pick someone else.',
  ran: 'Ran last expedition — they cannot run again.',
  guided: 'Guided last expedition — they cannot guide again.',
};

export function castRowMark(player, cast, { selfId, lastPair, livingCount } = {}) {
  const blocked = castRowBlock(player?.id, cast, { lastPair, livingCount });
  if (blocked === 'runner') return ' · runner';
  if (blocked === 'ran') return ' · ran last';
  if (blocked === 'guided') return ' · guided last';
  if (player?.id && player.id === selfId) return ' (you)';
  return '';
}

export function applyCastLock(cast) {
  const cur = cast || freshCast();
  if (!cur.draft || cur.phase === 'sent') return cur;
  if (cur.phase === 'runner') {
    return { ...cur, runner: cur.draft, draft: null, phase: 'guide' };
  }
  if (cur.phase === 'guide') {
    if (cur.draft === cur.runner) return cur;
    return { ...cur, guide: cur.draft, draft: null, phase: 'sent' };
  }
  return cur;
}

/** Null until both seats are locked. This is what the phone may send. */
export function ballotFromCast(cast, voter) {
  if (!cast || cast.phase !== 'sent') return null;
  if (!voter || !cast.runner || !cast.guide || cast.runner === cast.guide) return null;
  return { voter, runner: cast.runner, guide: cast.guide };
}

const STOCK_NAME = /^Robot \d+$/;

export function isStockRobotName(name) {
  return STOCK_NAME.test(String(name || ''));
}

/**
 * What a shared screen may print for a joined player.
 *
 * Stock `Robot N` is a real name — prefer it over "The runner" / "The guide".
 * Missing names, `playerName`'s `'—'` sentinel, and a raw id still fall back.
 */
export function publicName(name, id, fallback) {
  const n = name == null ? '' : String(name);
  if (!n || n === '—' || n === String(id || '')) return fallback;
  return n;
}

/**
 * Joined phones only. Empty Robot N chairs cannot be nominated.
 * A dropped phone stays if they already have a human name.
 */
export function nominationPlayers(framePlayers, lobby) {
  const byId = new Map((framePlayers || []).map((p) => [p.id, p]));
  const out = [];
  for (const s of (lobby?.seats || [])) {
    if (s.isTV || !s.joined || !s.playerId) continue;
    if (!s.connected && isStockRobotName(s.name)) continue;
    const p = byId.get(s.playerId) || {};
    if (p.alive === false) continue;
    out.push({
      id: s.playerId,
      name: s.name || p.name || s.playerId,
      seat: s.seat ?? p.seat ?? null,
      alive: true,
    });
  }
  return out;
}

/** Lobby name wins over a leftover Robot N on the state frame. */
export function mergePublicNames(framePlayers, lobby) {
  const names = new Map();
  for (const s of (lobby?.seats || [])) {
    if (s.isTV || !s.playerId || !s.name) continue;
    names.set(s.playerId, s.name);
  }
  const rows = (framePlayers && framePlayers.length)
    ? framePlayers
    : (lobby?.seats || []).filter((s) => !s.isTV && s.playerId).map((s) => ({
      id: s.playerId, name: s.name, seat: s.seat, alive: true,
    }));
  return rows.map((p) => ({ ...p, name: names.get(p.id) || p.name }));
}

export function padlockSvg() {
  return `<svg class="padlock" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 10V8a4 4 0 1 1 8 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <rect x="6" y="10" width="12" height="10" rx="2" fill="currentColor"/>
    <circle cx="12" cy="15" r="1.4" fill="#1a1208"/>
  </svg>`;
}
