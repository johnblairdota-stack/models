import * as THREE from 'three';
import { WEAPON_DAMAGE, WEAPON_RANGE, SOCKETS, SOCKET_KIND } from './rules.js';
import { playGunshot } from '../audio/audio.js';

/**
 * WEAPONS — the thing that was missing between the gadgets and the destruction system.
 *
 * `src/destruction/wall.js` has had a damage entry point since it was written and nothing
 * has ever called it. This does: a shot traces against the room, and if it lands on a
 * `DestructibleWall` it calls `panel.damage(WEAPON_DAMAGE[weapon])`, which drives the state
 * machine, which crosses stages, which fires the stage-change listener, which spawns the
 * debris and the dust and — at the last stage — stops the panel blocking movement.
 * Shooting a wall opens a route. That is the entire point of the layer model.
 *
 * DAMAGE IS A PROPERTY OF THE WEAPON, NEVER OF THE CALLER. The table lives in rules.js and
 * `net/server.mjs` imports the same file, so an authoritative server and an offline client
 * cannot disagree about how many nails a plaster wall takes.
 *
 * Bodies work the same way: a hit does not subtract, it picks a SOCKET and empties it.
 * Which socket depends on where the shot landed, so shooting someone in the leg takes
 * their leg, and the leg lands on the floor where you can pick it up.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class WeaponSystem {
  constructor(o = {}) {
    this.room = o.room;
    this.limbField = o.limbField ?? null;
    this.debris = o.debris ?? null;
    this.dust = o.dust ?? null;
    this.rng = o.rng ?? (() => 0.5);
    this.bodies = [];                 // { rig, root, radius, height, team }
    this.onWallHit = null;
    this.onBodyHit = null;

    this.tracers = new Tracers(o.scene, o.maxTracers ?? 48);
    this.scene = o.scene ?? null;
    this.fires = [];                  // burning oil pools — see `fire()` and `_updateFires()`
  }

  /**
   * OIL IS AREA DENIAL, not a gun. `rules.js` gives it 52 damage at 12 m and says it "burns
   * through plaster fast"; as a hitscan that is just a short-range nailgun that hits harder.
   * What it is FOR is shaping space — the one thing the player otherwise cannot do to a
   * hunter that is faster than them in a straight line.
   *
   * So the 52 is a TOTAL OVER TIME, not per hit: a pool that burns for `FIRE_SECONDS` and
   * damages whatever stands in it. A doorway becomes a decision the hunter has to make.
   */
  _lightFire(point) {
    const FIRE_SECONDS = 6.0, RADIUS = 1.35;
    let mesh = null;
    if (this.scene) {
      const g = new THREE.CircleGeometry(RADIUS, 22);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({
        color: 0xff7a2a, transparent: true, opacity: 0.72, depthWrite: false,
      });
      mesh = new THREE.Mesh(g, m);
      mesh.position.set(point.x, (this.room?.floorY ?? 0) + 0.02, point.z);
      mesh.renderOrder = 3;
      this.scene.add(mesh);
    }
    this.fires.push({ pos: point.clone(), r: RADIUS, left: FIRE_SECONDS, dur: FIRE_SECONDS, mesh, tick: 0 });
    if (this.fires.length > 6) this._douse(this.fires.shift());
  }

  _douse(f) {
    if (!f?.mesh) return;
    f.mesh.removeFromParent();
    f.mesh.geometry.dispose();
    f.mesh.material.dispose();
    f.mesh = null;
  }

  _updateFires(dt) {
    const DPS = WEAPON_DAMAGE.oil / 6.0;      // the table's 52, spread over the burn
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.left -= dt;
      if (f.mesh) {
        // guttering, and fading out as it dies — a constant disc reads as a decal
        const k = Math.max(0, f.left / f.dur);
        f.mesh.material.opacity = (0.30 + 0.42 * k) * (0.86 + 0.14 * Math.sin(f.left * 11));
        f.mesh.scale.setScalar(0.72 + 0.28 * k);
      }
      f.tick -= dt;
      if (f.tick <= 0) {
        f.tick = 0.25;
        for (const b of this.bodies) {
          if (!b.root) continue;
          const d = Math.hypot(b.root.position.x - f.pos.x, b.root.position.z - f.pos.z);
          if (d > f.r) continue;
          // Standing in fire costs a quarter-second's worth. The hunter staggers; a player
          // loses a limb the same way anything else takes one from them.
          if (b.hunter) b.hunter.stagger?.(DPS * 0.25, new THREE.Vector3(0, 0, 0), b.root.position);
          else if (b.rig) this.hitBody(b, b.root.position.clone(), new THREE.Vector3(0, 1, 0), 'oil', DPS * 0.25);
        }
      }
      if (f.left <= 0) { this._douse(f); this.fires.splice(i, 1); }
    }
  }

  addBody(b) { this.bodies.push(b); return b; }
  removeBody(b) { const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1); }

  /**
   * A shot. Traces the room and the bodies, applies the weapon's own damage to whatever
   * it found first.
   * @returns {{kind:'wall'|'body'|'miss', point:THREE.Vector3, panel?, body?, result?}}
   */
  fire(weapon, origin, dir, t, opts = {}) {
    const dmg = WEAPON_DAMAGE[weapon];
    if (dmg == null) return { kind: 'miss', point: origin.clone() };
    const range = opts.range ?? WEAPON_RANGE[weapon] ?? 20;

    // ---- 🔊 the trigger sound, not the impact sound — fires whether this shot lands or
    // misses, same as a real gun. Single hook for both the live path (player, game.js) and
    // the capture Director's own `weapons.fire()` call; inert there because `initAudio` is
    // never called in capture mode. See `src/audio/audio.js`.
    if (weapon === 'nailgun') playGunshot();

    const wall = this.room?.castRay(origin, dir, range, { forDamage: true }) ?? null;
    const body = this._traceBodies(origin, dir, Math.min(range, wall?.distance ?? range), opts.ignore);

    let out;
    if (body && (!wall || body.distance < wall.distance)) {
      out = this.hitBody(body.body, body.point, dir, weapon, dmg);
    } else if (wall && wall.panel) {
      out = this.hitWall(wall.panel, wall.point, dir, weapon, dmg);
    } else if (wall) {
      out = { kind: 'wall', point: wall.point, panel: null };
    } else {
      out = { kind: 'miss', point: origin.clone().addScaledVector(dir, range) };
    }

    // ---- THE BALL IS A DECOY, and this is the line that makes it one.
    //
    // `rules.js` gives it 9 damage at 18 m and says so in its own comment: "bouncy balls
    // barely scratch a wall; they are for reaching things". As a hitscan that is simply a bad
    // gun. What it is FOR is making a sound somewhere you are not — the one stealth verb the
    // game had no way to express, because every noise the hunter can hear belonged to a body
    // it could also chase. `hearNoise` sends it to investigate a point with nothing at it.
    //
    // Loud (0.85, near a gunshot) because the whole point is that it out-competes your own
    // footsteps; and emitted at the IMPACT point, not at the player, which is the difference
    // between a distraction and a confession.
    if (weapon === 'ball' && out.point) {
      this.hunter?.hearNoise?.(out.point, 0.85);
    }
    // Oil leaves a burning pool where it lands — see `_lightFire`. The impact damage above
    // still applies to whatever it hit directly; the pool is the part that denies ground.
    if (weapon === 'oil' && out.point) this._lightFire(out.point);

    // ---- THE GRAPPLE PULLS. It is the answer to "I am cornered".
    //
    // On a surface it hauls the SHOOTER to the anchor — an escape that does not depend on
    // out-running something faster than you. On the HUNTER it hauls the hunter a short way
    // instead: a desperate, high-risk reposition (you are dragging the thing toward you) that
    // costs a 1.4 s cooldown, which is the longest in the game for exactly this reason.
    if (weapon === 'grapple' && out.point) {
      if (out.kind === 'body' && out.body?.hunter) {
        const h = out.body.hunter;
        const dx = origin.x - h.root.position.x, dz = origin.z - h.root.position.z;
        const d = Math.hypot(dx, dz) || 1;
        h.stagger?.(WEAPON_DAMAGE.grapple, new THREE.Vector3(dx / d, 0, dz / d), out.point);
        h.root.position.x += (dx / d) * 1.6;
        h.root.position.z += (dz / d) * 1.6;
      } else if (opts.shooter?.grappleTo) {
        // stop short of the anchor so the landing is beside the wall, not inside it
        const to = out.point.clone();
        to.x -= dir.x * 1.1; to.z -= dir.z * 1.1;
        opts.shooter.grappleTo(to, WEAPON_RANGE.grapple);
      }
    }

    // the tracer is a COSMETIC — nothing derives from it, so it can be dropped freely,
    // which is exactly the property the netcode's unreliable channel needs
    if (weapon !== 'fist' && weapon !== 'limbClub') this.tracers.add(origin, out.point, t, weapon);
    return out;
  }

  /** Apply a weapon's damage to a wall panel and throw the matching muck. */
  hitWall(panel, point, dir, weapon, dmg = WEAPON_DAMAGE[weapon]) {
    const before = panel.stage;
    const kind = panel.debrisKind;
    const res = panel.damage(dmg, { point: point.toArray(), weapon });
    this._impact(point, dir, kind, res?.changed ? 'break' : 'chip');
    this.onWallHit?.(panel, point, res, weapon);
    return { kind: 'wall', point, panel, result: res, from: before };
  }

  /**
   * Apply a hit to a body. Picks the socket by where it landed — high on the torso takes
   * an arm, low takes a leg — and detaches it with the shot's momentum, so the limb flies
   * off in the direction the hit came from.
   */
  hitBody(body, point, dir, weapon, dmg = WEAPON_DAMAGE[weapon]) {
    const rig = body.rig;
    // Not everything that can be shot has sockets. The hunter cannot be killed and has no
    // limbs to lose — hitting it buys you distance and nothing else, which is the whole
    // relationship the game wants you to have with it.
    if (!rig) {
      body.hunter?.stagger(dmg, dir, point);
      this.debris?.burst('plaster', point, 3, { dir: _v.copy(dir).multiplyScalar(-1), spread: 0.9, speed: 2.6 });
      return { kind: 'body', point, body, staggered: true };
    }
    const socket = pickSocket(rig, body, point, this.rng);
    if (!socket) return { kind: 'body', point, body, result: null };
    const power = Math.min(1.6, 0.5 + dmg / 45);
    const item = rig.detach(socket, {
      impulse: _v.copy(dir).multiplyScalar(1.4 * power).setY(1.9 + power * 0.9).clone(),
      spin: _v2.set((this.rng() - 0.5) * 7, (this.rng() - 0.5) * 7, (this.rng() - 0.5) * 9).clone(),
    });
    this.onBodyHit?.(body, socket, item, weapon);
    return { kind: 'body', point, body, socket, item };
  }

  /** A club swing: a short sphere trace out of the club head. */
  melee(weapon, at, dir, t, opts = {}) {
    const reach = WEAPON_RANGE[weapon] ?? 1.8;
    return this.fire(weapon, at, dir, t, { ...opts, range: reach });
  }

  _traceBodies(origin, dir, maxDist, ignore) {
    let best = null;
    for (const b of this.bodies) {
      if (b === ignore || b.rig === ignore) continue;
      const h = rayCapsule(origin, dir, b.root.position, b.height ?? 1.7, b.radius ?? 0.34);
      if (h == null || h < 0 || h > maxDist) continue;
      if (!best || h < best.distance) best = { body: b, distance: h, point: origin.clone().addScaledVector(dir, h) };
    }
    return best;
  }

  _impact(point, dir, kind, severity) {
    const n = severity === 'break' ? 14 : 3;
    this.debris?.burst(kind, point, n, { dir: _v.copy(dir).multiplyScalar(-1), spread: 0.7, speed: severity === 'break' ? 4.5 : 2.2 });
    this.dust?.burst(point, severity === 'break' ? 16 : 5, { radius: severity === 'break' ? 0.7 : 0.25 });
  }

  update(dt, t) { this.tracers.update(dt, t); this._updateFires(dt); }
  dispose() { this.tracers.dispose(); for (const f of this.fires) this._douse(f); this.fires.length = 0; }
}

/**
 * Where a hit lands decides what you lose. Height picks arm vs leg, the side the shot came
 * from picks left vs right, and if that socket is already empty the neighbouring one takes
 * it — so a body with three limbs gone still loses the fourth rather than absorbing shots.
 */
export function pickSocket(rig, body, point, rng = Math.random) {
  const h = body.height ?? 1.7;
  const local = point.y - body.root.position.y;
  const wantKind = local > h * 0.46 ? 'arm' : 'leg';
  const rel = point.clone().sub(body.root.position);
  const side = rel.x >= 0 ? 'R' : 'L';
  const order = [
    wantKind === 'arm' ? `shoulder${side}` : `hip${side}`,
    wantKind === 'arm' ? `shoulder${side === 'L' ? 'R' : 'L'}` : `hip${side === 'L' ? 'R' : 'L'}`,
    ...SOCKETS,
  ];
  for (const s of order) if (rig.occupant(s) !== 'empty') return s;
  return null;
}

// ---------------------------------------------------------------------------

/**
 * Tracer pool. One LineSegments, one buffer write a frame, no allocation. Tracers are
 * cosmetic: they carry no state and a client that never draws one is still correct.
 */
class Tracers {
  constructor(scene, max = 48) {
    this.max = max;
    this.t0 = new Float32Array(max);
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene?.add(this.mesh);
  }

  add(from, to, t, weapon) {
    const i = this.next++ % this.max;
    this.t0[i] = t;
    this.pos.set([from.x, from.y, from.z, to.x, to.y, to.z], i * 6);
    const c = weapon === 'oil' ? [1.0, 0.42, 0.10] : weapon === 'ball' ? [0.55, 0.85, 1.0] : [1.0, 0.78, 0.42];
    this.col.set([...c, ...c], i * 6);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  update(dt, t) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.t0[i] === 0) continue;
      const age = t - this.t0[i];
      if (age > 0.11) {
        this.t0[i] = 0;
        this.pos.fill(0, i * 6, i * 6 + 6);
        any = true;
      }
    }
    if (any) this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}

/** Ray vs a vertical capsule approximated as a cylinder — enough for a body hit. */
function rayCapsule(o, d, base, height, radius) {
  const dx = d.x, dz = d.z;
  const ox = o.x - base.x, oz = o.z - base.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
    if (t < 0) continue;
    const y = o.y + d.y * t - base.y;
    if (y >= 0 && y <= height) return t;
  }
  return null;
}

export { SOCKET_KIND };
