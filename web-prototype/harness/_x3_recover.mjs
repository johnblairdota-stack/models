#!/usr/bin/env node
/**
 * PROBE X3 — HELD-OUT MEASUREMENT. Recover the sealed deal from public observables only.
 *
 * The cheat knows, with no devtools beyond the network tab:
 *   code      printed on the television
 *   count     the roster every phone is sent
 *   window    a bracket on `stamp`, from /report's durationMs + the server clock in `ping`
 *   own role  their own card (you.roleName -> the role key), and own alignment
 *   wings     `expedition.room`, announced PUBLICLY at CASTING, one per episode
 * They enumerate stamps, deal each candidate, and keep the ones that agree with what they see.
 * Nothing here reads castSeed, worldSeed or truth.
 */
import { seedFrom } from '../net/party/show.mjs';
import { dealCast, ROLES } from '../src/party/cast.js';
import { pick } from '../src/party/session.js';
import { WINGS } from '../src/party/houseplan.js';

const TRIALS = +(process.env.TRIALS || 400);
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const rndCode = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const key = (d) => d.evil.slice().sort().join(',');

function run({ half, wings, count }) {
  let solved = 0, unique = 0, survivorsTotal = 0, baselineHits = 0;
  for (let n = 0; n < TRIALS; n++) {
    const code = rndCode();
    const stamp = 1787000000000 + Math.floor(Math.random() * 1e7);
    const castSeed = seedFrom(code, 'cast', stamp, count);
    const worldSeed = seedFrom(code, 'world', stamp, count);
    const deal = dealCast({ count, castSeed });
    const me = deal.seats[Math.floor(Math.random() * count)];
    const myCard = me.cover ?? me.role;                       // what the phone actually shows
    const trueWings = [];
    for (let ep = 1; ep <= wings; ep++) trueWings.push(WINGS[pick(WINGS.length, worldSeed, 'target', ep)]);

    // ---- the attacker's search. Bracket is centred on the true stamp, width 2*half+1.
    const centre = stamp + Math.floor((Math.random() * 2 - 1) * half * 0.6);
    const surv = [];
    for (let s = centre - half; s <= centre + half; s++) {
      const cs = seedFrom(code, 'cast', s, count);
      const d = dealCast({ count, castSeed: cs });
      const mine = d.seats[me.seat];
      if ((mine.cover ?? mine.role) !== myCard) continue;      // my own card must come out right
      if (mine.alignment !== me.alignment) continue;
      const ws = seedFrom(code, 'world', s, count);
      let ok = true;
      for (let ep = 1; ep <= wings; ep++) {
        if (WINGS[pick(WINGS.length, ws, 'target', ep)] !== trueWings[ep - 1]) { ok = false; break; }
      }
      if (ok) surv.push(d);
    }
    survivorsTotal += surv.length;
    if (surv.length === 1) unique++;
    // majority vote over survivors on "who is Production"
    if (surv.length) {
      const tally = new Map();
      for (const d of surv) tally.set(key(d), (tally.get(key(d)) || 0) + 1);
      const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (best === key(deal)) solved++;
    }
    // baseline: guess the evil set at random among players who are not me (I know my own side)
    const others = deal.seats.filter((s) => s.id !== me.id).map((s) => s.id);
    const nEvil = deal.evil.length - (me.alignment === 'evil' ? 1 : 0);
    const guess = others.slice().sort(() => Math.random() - 0.5).slice(0, nEvil);
    const full = (me.alignment === 'evil' ? [me.id, ...guess] : guess).sort().join(',');
    if (full === key(deal)) baselineHits++;
  }
  return { solved: solved / TRIALS, unique: unique / TRIALS, mean: survivorsTotal / TRIALS, base: baselineHits / TRIALS };
}

console.log('count  window(ms)  wings-seen   P(Production set recovered)   P(unique stamp)  mean survivors   chance baseline');
for (const count of [8, 5]) {
  for (const [half, wings] of [[60, 0], [60, 1], [60, 2], [2500, 1], [2500, 2], [2500, 3]]) {
    const r = run({ half, wings, count });
    console.log(`${String(count).padEnd(6)} ±${String(half).padEnd(10)} ${String(wings).padEnd(12)} ${(r.solved * 100).toFixed(1).padStart(8)}%  ${(r.unique * 100).toFixed(1).padStart(20)}%  ${r.mean.toFixed(2).padStart(13)}   ${(r.base * 100).toFixed(1).padStart(10)}%`);
  }
}
