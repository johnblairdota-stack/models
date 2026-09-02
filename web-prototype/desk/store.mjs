/**
 * The Desk — card store and the Done rule.
 *
 * Done is not a lane you can move a card into. `move()` rejects it.
 * The ONLY way a card reaches Done is `verify()`, and verify demands:
 *   1. an owner            (a name, not a lane)
 *   2. a valid route       (spec | game | art | critic | skills)
 *   3. a registered check  (from checks.mjs)
 *   4. that check passing  (a real read of the repo / a real harness run)
 * Re-verifying a Done card whose check now fails demotes it back to Verify —
 * Done is continuously earned, never granted.
 */

import { readFile, writeFile } from 'node:fs/promises';

export const ROUTES = ['spec', 'game', 'art', 'critic', 'skills'];
export const LANES = ['pitch', 'route', 'verify', 'done'];
export const MOVABLE_LANES = ['pitch', 'route', 'verify'];

export class DeskError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function createStore({ seedPath, statePath = null, checks, repoRoot }) {
  const cards = JSON.parse(await readFile(seedPath, 'utf8'));
  if (statePath) {
    try {
      const saved = JSON.parse(await readFile(statePath, 'utf8'));
      for (const card of cards) Object.assign(card, saved[card.id] || {});
    } catch { /* first boot — no saved state */ }
  }

  async function persist() {
    if (!statePath) return;
    const out = {};
    for (const c of cards) {
      out[c.id] = { lane: c.lane, route: c.route, owner: c.owner, lastVerify: c.lastVerify || null };
    }
    await writeFile(statePath, JSON.stringify(out, null, 2));
  }

  function find(id) {
    const card = cards.find((c) => c.id === id);
    if (!card) throw new DeskError(404, `no card "${id}"`);
    return card;
  }

  return {
    list() { return cards; },

    async move(id, lane) {
      const card = find(id);
      if (lane === 'done') throw new DeskError(400, 'Done is not a lane you move into. Run verify.');
      if (!MOVABLE_LANES.includes(lane)) throw new DeskError(400, `unknown lane "${lane}"`);
      if (card.lane === 'done') throw new DeskError(400, 'card is Done; re-verify to demote it, do not drag it');
      card.lane = lane;
      await persist();
      return card;
    },

    async setRoute(id, { route, owner }) {
      const card = find(id);
      if (route !== undefined) {
        if (route !== null && !ROUTES.includes(route)) throw new DeskError(400, `unknown route "${route}"`);
        card.route = route;
      }
      if (owner !== undefined) card.owner = String(owner || '').trim();
      await persist();
      return card;
    },

    async verify(id) {
      const card = find(id);
      const requirements = [];

      const ownerOk = typeof card.owner === 'string' && card.owner.trim().length > 0;
      requirements.push({ name: 'owner', pass: ownerOk, detail: ownerOk ? `owned by ${card.owner}` : 'no owner — a card without a name on it is chat' });

      const routeOk = ROUTES.includes(card.route);
      requirements.push({ name: 'route', pass: routeOk, detail: routeOk ? `routed to ${card.route}` : 'not routed — pick spec / game / art / critic / skills' });

      const checkFn = card.check ? checks[card.check] : null;
      requirements.push({ name: 'check-registered', pass: !!checkFn, detail: checkFn ? `backend check: ${card.check}` : 'no backend check registered — this card cannot reach Done yet' });

      if (checkFn) {
        let result;
        try { result = await checkFn(repoRoot); }
        catch (err) { result = { pass: false, detail: `check crashed: ${err.message}` }; }
        requirements.push({ name: card.check, ...result });
      }

      const pass = requirements.every((r) => r.pass);
      card.lane = pass ? 'done' : (card.lane === 'done' ? 'verify' : card.lane);
      card.lastVerify = { at: new Date().toISOString(), pass, requirements };
      await persist();
      return { pass, requirements, card };
    },
  };
}
