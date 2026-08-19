/**
 * Layered wall destruction — the state machine.
 *
 * This is a PORT of the design already proven in the UE5 project. See
 * `RunRobotRun/README.md`, sections "Why not a pure Chaos Geometry Collection" and
 * "The layer model". Do not re-invent it; the reasoning there still holds:
 *
 *   - Damage states are AUTHORED and DISCRETE, not a continuous fracture sim, because
 *     design pillar 1 wants damage that is legible and repeatable. A fracture sim never
 *     reads the same way twice and is expensive to replicate faithfully.
 *   - The two rules that drive everything:
 *         layer i is VISIBLE        when  i >= currentStage
 *         layer i OWNS COLLISION    when  i == currentStage
 *     Damage therefore *reveals* what was always behind the surface rather than swapping
 *     one mesh for another. That is what makes the broken edges read as layered.
 *   - At the final stage no index matches, so the wall stops blocking and the path opens.
 *   - Server-authoritative by construction: every mutator early-outs without authority.
 *   - Overkill damage carries through into the next stage rather than being discarded.
 *   - Cosmetics (debris, dust, sound) are fire-and-forget and may be dropped; the
 *     authoritative stage is what keeps a late joiner correct.
 *
 * DELIBERATE DIVERGENCE FROM THE README: it describes 4 stages (gilding / lath / frame /
 * open) for 3 mesh layers. This prototype's spec is FIVE stages —
 * wallpaper -> plaster -> lath -> beam -> open air — so the machine here is generalised to
 * N layers and configured with 4. The rules are unchanged. Do not "fix" this back to 4.
 */

export const STAGE = { WALLPAPER: 0, PLASTER: 1, LATH: 2, BEAM: 3, OPEN: 4 };
export const STAGE_NAMES = ['wallpaper', 'plaster', 'lath', 'beam', 'open'];

/**
 * Per-stage definition. `health` is what must be chewed through to leave this stage.
 * The flags mirror the README's table — note that `blocksShots` and `damageable` diverge
 * at the beam stage, which is exactly why the UE version needed a separate Destructible
 * trace channel: "can I damage this" and "does this stop a bullet" are different questions.
 */
export const STAGE_DEFS = [
  { stage: 0, name: 'wallpaper', health: 40,  blocksMove: true,  blocksShots: true,  blocksSight: true,  climbable: false, damageable: true },
  { stage: 1, name: 'plaster',   health: 70,  blocksMove: true,  blocksShots: true,  blocksSight: true,  climbable: false, damageable: true },
  { stage: 2, name: 'lath',      health: 55,  blocksMove: true,  blocksShots: true,  blocksSight: true,  climbable: true,  damageable: true },
  // beams: shots and sightlines pass BETWEEN the studs, but the studs are still a target
  { stage: 3, name: 'beam',      health: 90,  blocksMove: true,  blocksShots: false, blocksSight: false, climbable: true,  damageable: true },
  // open air: nothing left to hit
  { stage: 4, name: 'open',      health: 0,   blocksMove: false, blocksShots: false, blocksSight: false, climbable: false, damageable: false },
];

export const FINAL_STAGE = STAGE_DEFS.length - 1;

/**
 * One destructible wall panel's authoritative state. Pure logic, no Three.js — so it runs
 * identically on the server and in a headless test.
 */
export class WallState {
  /**
   * @param {object} o
   * @param {string} o.id            stable id, used on the wire
   * @param {number} [o.stage=0]
   * @param {boolean} [o.authority=false]  only the server mutates
   * @param {STAGE_DEFS} [o.defs]
   */
  constructor(o = {}) {
    this.id = o.id ?? 'wall';
    this.defs = o.defs ?? STAGE_DEFS;
    this.stage = o.stage ?? 0;
    this.stageHealth = this.defs[this.stage].health;
    this.authority = !!o.authority;
    // listeners get (stage, info) on every authoritative change AND on remote sync, so
    // presentation code has exactly one path to follow
    this._onStage = new Set();
  }

  get def() { return this.defs[this.stage]; }
  get isOpen() { return this.stage >= FINAL_STAGE; }
  get name() { return this.defs[this.stage].name; }

  /** README rule 1: layer i is visible when i >= currentStage. */
  isLayerVisible(i) { return i >= this.stage; }
  /** README rule 2: layer i owns collision when i == currentStage. */
  layerOwnsCollision(i) { return i === this.stage; }

  onStageChange(fn) { this._onStage.add(fn); return () => this._onStage.delete(fn); }

  _emit(info) { for (const fn of this._onStage) fn(this.stage, info); }

  /**
   * Apply damage. Server only — mirrors the UE version's `!HasAuthority()` early-out.
   * Overkill carries through, so one big hit can skip stages, and a hit that lands on an
   * already-open wall is a no-op rather than an error.
   *
   * @returns {{changed:boolean, from:number, to:number, stagesCrossed:number[], overkill:number}}
   */
  applyDamage(amount, hit = null) {
    const from = this.stage;
    const crossed = [];
    if (!this.authority) return { changed: false, from, to: from, stagesCrossed: crossed, overkill: 0 };
    if (!Number.isFinite(amount) || amount <= 0) return { changed: false, from, to: from, stagesCrossed: crossed, overkill: 0 };
    if (this.isOpen || !this.def.damageable) return { changed: false, from, to: from, stagesCrossed: crossed, overkill: 0 };

    let remaining = amount;
    while (remaining > 0 && !this.isOpen) {
      if (remaining >= this.stageHealth) {
        remaining -= this.stageHealth;
        crossed.push(this.stage);
        this.stage++;
        this.stageHealth = this.defs[this.stage].health;
        if (this.isOpen) break;
      } else {
        this.stageHealth -= remaining;
        remaining = 0;
      }
    }

    const changed = this.stage !== from;
    if (changed) this._emit({ from, hit, crossed, authoritative: true });
    return { changed, from, to: this.stage, stagesCrossed: crossed, overkill: remaining };
  }

  /** Jump straight to a stage. Server only. Used by the debug harness and by tests. */
  setStage(stage, hit = null) {
    if (!this.authority) return false;
    const s = Math.max(0, Math.min(FINAL_STAGE, stage | 0));
    if (s === this.stage) return false;
    const from = this.stage;
    this.stage = s;
    this.stageHealth = this.defs[s].health;
    this._emit({ from, hit, crossed: rangeBetween(from, s), authoritative: true });
    return true;
  }

  advanceStage(hit = null) { return this.setStage(this.stage + 1, hit); }

  reset() {
    if (!this.authority) return false;
    const from = this.stage;
    this.stage = 0;
    this.stageHealth = this.defs[0].health;
    if (from !== 0) this._emit({ from, hit: null, crossed: [], authoritative: true, reset: true });
    return true;
  }

  /**
   * Client path. The authoritative stage is the only thing replicated — `stageHealth` is
   * deliberately NOT sent, because a client has no use for it (README: "clients have no
   * use for it"). A late joiner calling this lands in the right visual state silently.
   */
  syncStage(stage, info = {}) {
    const s = Math.max(0, Math.min(FINAL_STAGE, stage | 0));
    if (s === this.stage) return false;
    const from = this.stage;
    this.stage = s;
    this.stageHealth = this.defs[s].health;
    this._emit({ from, hit: info.hit ?? null, crossed: rangeBetween(from, s), authoritative: false });
    return true;
  }

  /** Minimal wire form. Stage only — see syncStage. */
  serialize() { return { id: this.id, stage: this.stage }; }

  /**
   * IS THERE ANY STAGE OF THIS PANEL THAT STOPS BLOCKING MOVEMENT?
   *
   * ⚠️ **A QUESTION ABOUT THE TABLE, NOT ABOUT THE CURRENT STATE**, and it exists because
   * `docs/design/dig.md`'s barrier introduces the first panel in the game that is a wall
   * FOREVER: a dig segment's terminal stage is `barrier`, not `open`, so no amount of damage
   * from either side ever turns it into a route.
   *
   * Everything that treats a panel as "a door I can make" has to ask this first. `hunter-ai.js`
   * is the one that matters: `_tooNarrowPanel` and `_blockingPanel` pick a wall to slam, and a
   * hunter that picks one it can never open chews through a thousand hit points and then picks
   * its neighbour. That does not throw — it looks exactly like an AI that forgot what it was
   * doing, which `hunter-ai.js` already records as the most expensive failure class here.
   *
   * ⚠️ **AND IT IS INERT FOR EVERY TABLE THAT SHIPPED.** `STAGE_DEFS`, `EXIT_DEFS` and
   * `CHAINED_DEFS` all end at the `open` stage (`CHAINED_DEFS` carries stages 1..4 over from
   * `STAGE_DEFS` precisely so §8's detonation can drive them there), so this returns `true` for
   * every panel in the default build and any caller that gates on it changes nothing with
   * `?dig=0`. That is the property the dig toggle's completeness rests on, so do not "simplify"
   * this into a test of the current stage.
   */
  canOpen() { return this.defs.some((d) => !d.blocksMove); }

  /** Queries the traversal / AI / weapon systems ask. */
  blocksMovement() { return this.def.blocksMove; }
  blocksProjectile() { return this.def.blocksShots; }
  blocksLineOfSight() { return this.def.blocksSight; }
  isClimbable() { return this.def.climbable; }
  isDamageable() { return this.def.damageable; }
}

function rangeBetween(from, to) {
  const out = [];
  for (let i = Math.min(from, to); i < Math.max(from, to); i++) out.push(i);
  return out;
}

/**
 * A field of wall panels. The hunter and the weapons address panels by id; destruction
 * opening a route is what makes the level topology dynamic.
 */
export class WallField {
  constructor({ authority = false } = {}) {
    this.authority = authority;
    this.walls = new Map();
    this._onAny = new Set();
  }

  add(id, opts = {}) {
    const w = new WallState({ ...opts, id, authority: this.authority });
    w.onStageChange((stage, info) => { for (const fn of this._onAny) fn(w, stage, info); });
    this.walls.set(id, w);
    return w;
  }

  get(id) { return this.walls.get(id); }
  onAnyStageChange(fn) { this._onAny.add(fn); return () => this._onAny.delete(fn); }

  damage(id, amount, hit) {
    const w = this.walls.get(id);
    return w ? w.applyDamage(amount, hit) : null;
  }

  resetAll() { for (const w of this.walls.values()) w.reset(); }

  /** Full snapshot, for a joining client. */
  snapshot() { return [...this.walls.values()].map((w) => w.serialize()); }

  applySnapshot(list) {
    for (const s of list) {
      const w = this.walls.get(s.id);
      if (w) w.syncStage(s.stage);
    }
  }

  stats() {
    const counts = new Array(STAGE_DEFS.length).fill(0);
    for (const w of this.walls.values()) counts[w.stage]++;
    return { total: this.walls.size, byStage: counts };
  }
}
