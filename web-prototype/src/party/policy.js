/**
 * 🤖 **BOT POLICIES — five ways to play, so the sim measures play rather than noise.**
 *
 * `docs/design/rrr-gates.md` §5. Four tuned policies plus `scatter`, which plays at random.
 *
 * 🚨 **`scatter` IS NOT DECORATION.** If the tuned policies do not produce a materially different
 * good win rate from random play, the sim is not measuring play and every band it reports is
 * noise. This is `debris-collapse` C5's two-policy discipline, which `_sag1-grain` and
 * `_limb1-rule` both copied so three files measure the same player.
 *
 * ⚠️ BOTS CANNOT MODEL THE SOCIAL LAYER, AND NOTHING HERE PRETENDS OTHERWISE. There is no bluff,
 * no reading a face, no reputation across episodes. What these validate is that the mechanical
 * scaffolding is not already broken before eight humans see it.
 *
 * No THREE, no DOM.
 */

export const POLICY = ['naive-good', 'cautious-good', 'patient-evil', 'aggressive-evil', 'scatter'];

/** Deterministic per-decision RNG. Same seed and same salt gives the same choice, always. */
export function chance(seed, salt) {
  let h = 0x811c9dc5 >>> 0;
  const s = `${seed}:${salt}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const pick = (seed, salt, list) => list[Math.floor(chance(seed, salt) * list.length)] ?? null;

/**
 * Will the guide lie on this call?
 *
 * A good guide never lies. `patient-evil` lies **only when the reading was NO SIGNAL** — the lie
 * is then indistinguishable from an honest guess, which is exactly the play the design rewards.
 * `aggressive-evil` lies whenever it guides, which should get it caught and is the point of
 * having both.
 */
export function willLie({ policy, hadSignal, seed, salt }) {
  switch (policy) {
    // 🚨 PATIENT MEANS SELECTIVE, NOT "WHENEVER IT IS SAFE". The first version lied on every
    // NO SIGNAL call — at 33% coverage that is two calls in three, which is not patience, it is
    // `aggressive-evil` with an alibi. `party-sim` S3 read it as 35% natural Hunter arrivals
    // against a 40-50% band: evil was causing so much of the trouble that an arrival was nearly
    // a confession. A patient player waits for a moment worth spending.
    case 'patient-evil':    return !hadSignal && chance(seed, `lie:${salt}`) < 0.35;
    case 'aggressive-evil': return chance(seed, `lie:${salt}`) < 0.75;
    case 'scatter':         return chance(seed, `lie:${salt}`) < 0.5;
    default:                return false;   // both good policies
  }
}

/** Casting: two names per living player. Good spread the load; evil angle for the guide chair. */
export function castBallot({ policy, self, living, history, seed, ep }) {
  const others = living.filter((id) => id !== self);
  if (policy === 'scatter') {
    return { voter: self, runner: pick(seed, `r${ep}${self}`, living), guide: pick(seed, `g${ep}${self}`, others) };
  }
  // 🚨 THE SEED HAS TO REACH THE TIE-BREAK OR EVERY MATCH IS THE SAME MATCH. The first version
  // sorted purely by expedition count, which is identical across seeds at episode 1 — so 1000
  // seeds produced four distinct games and `party-sim` S0b caught it. Equally-fresh players are
  // now separated by the seed, which is what a real table's opinions do.
  const freshest = living.slice().sort((a, b) => {
    const d = (history[a]?.expeditions ?? 0) - (history[b]?.expeditions ?? 0);
    return d !== 0 ? d : chance(seed, `tie${ep}${self}${a}${b}`) - 0.5;
  });
  if (policy.endsWith('evil')) {
    // 🚨 The guide's chair is the seat evil wants — it is the only private information in the
    // game (D13). Self-picking for it is loud, so it is done only about half the time.
    const wantGuide = chance(seed, `want${ep}${self}`) < 0.5 ? self : freshest[0];
    return { voter: self, runner: freshest.find((id) => id !== wantGuide) ?? others[0], guide: wantGuide };
  }
  return { voter: self, runner: freshest[0], guide: freshest.find((id) => id !== freshest[0]) ?? others[0] };
}

/**
 * Nomination. The only evidence a bot has is who guided when it went wrong — which is a fair
 * model of a table with no social read, and deliberately a weak one.
 */
export function nominate({ policy, self, living, suspicion, seed, ep }) {
  const others = living.filter((id) => id !== self);
  if (!others.length) return null;
  if (policy === 'scatter') return chance(seed, `nom${ep}${self}`) < 0.5 ? { nominator: self, target: pick(seed, `nt${ep}${self}`, others) } : null;

  if (policy.endsWith('evil')) {
    // Evil nominates a good player, and not every round, or it reads as a pattern.
    if (chance(seed, `enom${ep}${self}`) > 0.35) return null;
    return { nominator: self, target: pick(seed, `ent${ep}${self}`, others) };
  }

  const ranked = others.slice().sort((a, b) => (suspicion[b] ?? 0) - (suspicion[a] ?? 0));
  const top = ranked[0];
  if (!top || (suspicion[top] ?? 0) <= 0) return null;
  // `cautious-good` wants a second failure before it will accuse.
  if (policy === 'cautious-good' && (suspicion[top] ?? 0) < 2) return null;
  return { nominator: self, target: top };
}

/** The vote. Good back the most-suspected standing nominee; evil vote to protect their own. */
export function vote({ policy, self, standing, suspicion, evilSet, seed, ep }) {
  if (!standing.length) return 'NO_ONE';
  if (policy === 'scatter') return pick(seed, `v${ep}${self}`, [...standing, 'NO_ONE']);

  if (policy.endsWith('evil')) {
    const goodTargets = standing.filter((id) => !evilSet.has(id));
    if (goodTargets.length) return goodTargets[0];
    // 🚨 Only their own are standing: bus one rather than abstain. This is what produces the
    // Cold Blood award, and it is a real play rather than a bot quirk.
    return chance(seed, `bus${ep}${self}`) < 0.5 ? standing[0] : 'NO_ONE';
  }
  const ranked = standing.slice().sort((a, b) => (suspicion[b] ?? 0) - (suspicion[a] ?? 0));
  return (suspicion[ranked[0]] ?? 0) > 0 ? ranked[0] : 'NO_ONE';
}

/** The Producer's chair lever — the D1 counterweight, spent from a seat. */
export const spikesThisEpisode = ({ policy, seed, ep, self }) =>
  policy.endsWith('evil') && chance(seed, `spike${ep}${self}`) < 0.85;
