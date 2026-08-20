/**
 * 🎛️ **THE RENDERER ADAPTER — the one file in the Director that is allowed to look at the world.**
 *
 * `docs/design/rrr-broadcast.md` §7. `director.js` chooses the shot, `shots.js` does the framing
 * arithmetic, `broadcast.js` draws the furniture. This answers the five questions `shots.js` asks
 * and then points the actual camera.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHY THE SEAM IS HERE AND NOT ANYWHERE MORE CONVENIENT
 * ---------------------------------------------------------------------------------------------
 * `director.js`'s header: *"`hunter-ai.js`, `damagefield.js` and `spaces.js` all import THREE; if
 * the choice lived with them, `director-cut` would need a GPU and would never be run."* Everything
 * THREE-shaped in the Director is in this file, and it is deliberately the smallest of the four —
 * five lookups and a camera assignment. The interesting decisions all happen upstream, in modules
 * a gate can run in bare node.
 *
 * 🚨 IT REUSES THE ROOM'S OWN OCCLUSION TEST RATHER THAN ROLLING ONE. `room.blocksSight(a, b)`
 * (`src/game/room.js:1228`) already understands colliders, panels, and — the part nobody would
 * reimplement correctly — `sightBoxes()`, so that *"a sightline through a hole you dug is a
 * sightline and one into plaster beside it is not"*. A second raycaster here would disagree with
 * the game about what is visible, and the STATIC shot would show a wall the players had breached.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 UNEXERCISED, AND SAID OUT LOUD RATHER THAN IMPLIED.
 * ---------------------------------------------------------------------------------------------
 * The party mode is not wired to the mansion yet — M3 stubs the expedition — so **no gate drives
 * this file against a built room**, and nothing here has rendered a frame. `harness/shot-solver.mjs`
 * exercises the solvers through a fixture probe with the same five methods, which proves the
 * arithmetic and the contracts and proves nothing at all about `blocksSight` returning what this
 * expects. That arm lands when the mansion does. On this project a SKIP is never a PASS, and an
 * untested file that claims otherwise in its header is worse than a SKIP.
 */

import * as THREE from 'three';
import { SPACES } from './spaces.js';
import { cameraRoster, ROOMS as PARTY_ROOMS } from '../party/coverage.js';
import { ROOM_LABEL } from '../party/captions.js';

/** Half-angle of a fixed security camera, radians. Matches `FOV.STATIC` at a 16:9 frame. */
export const SITE_HALF_ANGLE = 0.62;
/** How far below the ceiling a camera is bracketed, and how far in from the corner. */
export const SITE_DROP = 0.45;
export const SITE_INSET = 0.55;

/**
 * Map the party mode's six room names onto the built house.
 *
 * ⚠️ THE GENERATED HOUSE DOES NOT PROMISE THESE NAMES. `spaces.js` builds from `HOUSE_PLAN` or
 * from a generated plan behind `PLAN_URL`, and a generated plan names its slots whatever the
 * generator felt like. So the match is by name where a name matches and by **stable index**
 * otherwise — deterministic, seed-free, and the same on every client, which is what matters. A
 * `Math.random` fallback here would put two players' cameras in different rooms.
 */
export function mapRooms(spaces = SPACES) {
  const byName = new Map(spaces.map((s) => [String(s.name || s.id).toLowerCase(), s]));
  const used = new Set();
  const out = {};
  for (const r of PARTY_ROOMS) {
    const hit = byName.get(r);
    if (hit && !used.has(hit)) { out[r] = hit; used.add(hit); }
  }
  const spare = spaces.filter((s) => !used.has(s));
  let i = 0;
  for (const r of PARTY_ROOMS) if (!out[r] && spare[i]) { out[r] = spare[i++]; }
  return out;
}

/** One fixed camera per room, bracketed in a corner, aimed at the middle of the floor. */
function siteFor(space, index) {
  const cx = (space.x0 + space.x1) / 2, cz = (space.z0 + space.z1) / 2;
  // Four corners, picked by index so the roster looks varied without being random.
  const sx = (index % 2) ? 1 : -1, sz = (index >> 1) % 2 ? 1 : -1;
  const x = (sx > 0 ? space.x1 - SITE_INSET : space.x0 + SITE_INSET);
  const z = (sz > 0 ? space.z1 - SITE_INSET : space.z0 + SITE_INSET);
  const y = (space.storey ?? 4.8) - SITE_DROP;
  const fwd = new THREE.Vector3(cx - x, -0.55, cz - z).normalize();
  return { index, room: null, x, y, z, fwd, bounds: space };
}

/**
 * @param {object} o
 * @param {THREE.PerspectiveCamera} o.camera   the broadcast camera this rig drives
 * @param {object} o.room                      the built room — needs `blocksSight`
 * @param {() => object} o.subjects            id -> `{x,y,z,yaw,eyeHeight}` for everyone on stage
 * @param {() => number} o.unlocked            how many cameras the crew has lit
 * @param {number} o.worldSeed
 */
export function createRig({ camera, room, subjects, unlocked, worldSeed, spaces = SPACES }) {
  const mapped = mapRooms(spaces);
  // 🚨 THE ROSTER IS `coverage.js`'s, NOT A SECOND ONE. `cameraRoster(worldSeed)` decides which
  // rooms each camera watches and the guide's sight is gated on exactly that; a rig that placed
  // its cameras somewhere else would put a room on the television that the guide cannot see,
  // which is S3 undone from the renderer.
  const roster = cameraRoster(worldSeed);
  const all = [];
  roster.forEach((cam, i) => {
    for (const roomName of cam.rooms) {
      const sp = mapped[roomName];
      if (!sp) continue;
      const s = siteFor(sp, all.length);
      s.room = roomName;
      s.camIndex = i;
      all.push(s);
    }
  });

  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

  const probe = {
    pose(id) {
      const s = subjects()[id];
      return s ? { x: s.x, y: s.y, z: s.z, yaw: s.yaw ?? 0, eyeHeight: s.eyeHeight ?? 1.62 } : null;
    },

    /** ⚠️ UNLOCKED ONLY — `shots.js` states this as the probe's contract and relies on it. */
    sites() {
      const n = unlocked();
      return all.filter((s) => s.camIndex < n);
    },

    /** How far a boom gets. The room's own ray, so the broadcast camera clips what the game clips. */
    boom(from, dir, maxLen) {
      if (!room || !room.blocksSight) return maxLen;
      _a.set(from.x, from.y, from.z);
      _b.set(from.x + dir.x * maxLen, from.y + dir.y * maxLen, from.z + dir.z * maxLen);
      // A coarse bisection rather than a second raycaster: `blocksSight` is the only sight
      // authority in the engine and this asks it the same question at shorter lengths.
      if (!room.blocksSight(_a, _b)) return maxLen;
      let lo = 0, hi = maxLen;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        _b.set(from.x + dir.x * mid, from.y + dir.y * mid, from.z + dir.z * mid);
        if (room.blocksSight(_a, _b)) hi = mid; else lo = mid;
      }
      return lo;
    },

    /** In this camera's room, inside its cone, and not behind something. All three, in that order. */
    sees(site, point) {
      const b = site.bounds;
      if (point.x < b.x0 || point.x > b.x1 || point.z < b.z0 || point.z > b.z1) return false;
      _d.set(point.x - site.x, point.y - site.y, point.z - site.z);
      const dist = _d.length();
      if (dist < 1e-3) return false;
      _d.multiplyScalar(1 / dist);
      if (_d.dot(site.fwd) < Math.cos(SITE_HALF_ANGLE)) return false;
      if (!room || !room.blocksSight) return true;
      _a.set(site.x, site.y, site.z);
      _b.set(point.x, point.y, point.z);
      return !room.blocksSight(_a, _b);
    },

    label: (r) => ROOM_LABEL[r] || String(r || '').toUpperCase(),

    /** Two subjects in different rooms, for SPLIT. Empty means the shot is unavailable. */
    splitSubjects() {
      const s = subjects();
      return Object.keys(s).filter((k) => k !== 'hunter').slice(0, 2);
    },
  };

  return {
    probe,
    sites: () => all.slice(),

    /**
     * Point the camera. A `card` shot moves nothing — the overlay covers the frame and the feed
     * behind it is whatever was last on air, which is exactly what a real gallery does.
     */
    apply(solved) {
      if (!solved || solved.kind !== 'live') return false;
      // §7 permits the cheap SPLIT: `setViewpoints([a,b])` (`src/game/room.js:1436`), two
      // viewports, no compositing. Until that is wired the rig takes the first pane.
      const s = solved.panes ? solved.panes[0] : solved;
      if (!s.eye) return false;
      camera.position.set(s.eye.x, s.eye.y, s.eye.z);
      camera.lookAt(s.at.x, s.at.y, s.at.z);
      if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
      return true;
    },
  };
}
