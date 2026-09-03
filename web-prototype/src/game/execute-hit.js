/**
 * execute-hit — THE LYNCH CONNECTS, in bare node.
 *
 * John, 29 Aug, after the dusk sit-down + LastLook board:
 *
 *   B is the show. C is a last-look box. The swing CONNECTS. The victim goes limp
 *   and looks smashed. That chair instance topples on its own. The box hard-cuts
 *   the instant they are dead.
 *
 * This file is the PLAN, not the picture. `intro-bed.js` owns the meshes, the
 * retarget and the cameras. Gates import this without THREE — `.github/workflows/gates.yml`
 * never `npm install`s.
 *
 * ⚠️ NO THREE, NO DOM, NO ENGINE.
 *
 * Why retarget the prop rather than swap Attack: `SWINGS[0]` is a floor chop
 * (`contact: 0.381`, head ~0.37 m under the floor). Swapping the clip would
 * restale the grip lock and invent a second hammer. Sliding the already-mounted
 * sledge head onto the seated torso/head on the contact frame keeps `GRIP_MOUNT`
 * and `Attack`. A miss is a bug; `occupies()` is the instrument.
 */

import { SHOWRUNNER } from '../party/vote.js';

/** Attack clip's measured contact phase — must stay equal to `SWINGS[0].contact`. */
export const HIT_CONTACT = 0.381;

/** Metres. Same world point, not a kiss-through. */
export const HIT_SLACK = 0.22;

/** Showrunner has no body: fire the hit this long after rise, no ninth robot. */
export const SHOW_CONTACT_S = 1.20;

/** How long the wreck holds before it is only a plate. Contact reads, then off. */
export const WRECK_HOLD_S = 0.50;

/**
 * The wreck plate after the execute cue goes empty. Same low pair B used on
 * the hit: look at limp body + loose chair, not a living visor (~1.16 m).
 * Metres above the floor.
 */
export const WRECK_LOOK_Y = 0.42;
export const WRECK_EYE_Y = 0.78;

/** Named wreck look. Dur 0 — do not linger a 10s talk-cycle wreck plate. */
export const WRECK_SHOT = Object.freeze({ name: 'wreck', dur: 0, span: 0.70 });

/**
 * Spec pan after contact. Same class as wreckCam / sendoffCam: numbers here, bed
 * drives, no CUE_KIND. Total 5.00 — not WRECK_SHOT.dur, not the 20s EXECUTION beat.
 */
export const LINGER_CRIME_S = 1.50;
export const LINGER_ORBIT_S = 1.50;
export const LINGER_GROUP_S = 2.00;
export const LINGER_TOTAL_S = 5.00;

export function lingerBeat(elapsed) {
  const t = Math.max(0, Number(elapsed) || 0);
  if (t < LINGER_CRIME_S) return 'crime';
  if (t < LINGER_CRIME_S + LINGER_ORBIT_S) return 'orbit';
  return 'group';
}

function lingerSmooth(k) {
  const t = Math.min(1, Math.max(0, Number(k) || 0));
  return t * t * (3 - 2 * t);
}

function lingerOrbitPose(wreck, u) {
  const ang = lingerSmooth(u) * Math.PI * 0.55;
  const lx = wreck.look.x, lz = wreck.look.z;
  const dx = wreck.eye.x - lx, dz = wreck.eye.z - lz;
  const dist = Math.hypot(dx, dz) || 2.5;
  const a0 = Math.atan2(dx, dz);
  const a = a0 + ang;
  return {
    look: { x: wreck.look.x, y: wreck.look.y, z: wreck.look.z },
    eye: {
      x: lx + Math.sin(a) * dist,
      y: wreck.eye.y,
      z: lz + Math.cos(a) * dist,
    },
  };
}

/**
 * Spec linger after the sledge connects. Crime 1.50 onto the wreck, orbit 1.50
 * around wreck + toppled chair, group 2.00 onto the seated living. THREE-free;
 * the bed applies the eye/look. Not fillExecuteEye (the nominator's rear).
 */
export function execLingerCam({
  body, chair, cx = 0, cz = 0, floorY = 0, living = [], elapsed = 0,
} = {}) {
  const wreck = wreckCam({ body, chair, cx, cz, floorY });
  const t = Math.max(0, Number(elapsed) || 0);
  const beat = lingerBeat(t);
  if (beat === 'crime') {
    const u = lingerSmooth(t / LINGER_CRIME_S);
    const startLook = { x: wreck.look.x, y: floorY + 1.05, z: wreck.look.z };
    const ox = wreck.eye.x - cx, oz = wreck.eye.z - cz;
    const startEye = {
      x: wreck.eye.x + ox * 0.28,
      y: floorY + WRECK_EYE_Y + 1.15,
      z: wreck.eye.z + oz * 0.28,
    };
    return {
      beat,
      look: {
        x: startLook.x + (wreck.look.x - startLook.x) * u,
        y: startLook.y + (wreck.look.y - startLook.y) * u,
        z: startLook.z + (wreck.look.z - startLook.z) * u,
      },
      eye: {
        x: startEye.x + (wreck.eye.x - startEye.x) * u,
        y: startEye.y + (wreck.eye.y - startEye.y) * u,
        z: startEye.z + (wreck.eye.z - startEye.z) * u,
      },
    };
  }
  if (beat === 'orbit') {
    const u = (t - LINGER_CRIME_S) / LINGER_ORBIT_S;
    return { beat, ...lingerOrbitPose(wreck, u) };
  }
  const u = lingerSmooth((t - LINGER_CRIME_S - LINGER_ORBIT_S) / LINGER_GROUP_S);
  const orbit = lingerOrbitPose(wreck, 1);
  let gx = 0, gz = 0, n = 0;
  for (const p of living) {
    if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.z))) continue;
    gx += Number(p.x); gz += Number(p.z); n++;
  }
  const look = n
    ? { x: gx / n, y: floorY + 1.16, z: gz / n }
    : { x: cx, y: floorY + 1.16, z: cz };
  const mx = look.x - cx, mz = look.z - cz;
  const mlen = Math.hypot(mx, mz) || 1;
  const groupEye = {
    x: cx - (mx / mlen) * 6.2,
    y: floorY + 1.42,
    z: cz - (mz / mlen) * 6.2,
  };
  return {
    beat,
    look: {
      x: orbit.look.x + (look.x - orbit.look.x) * u,
      y: orbit.look.y + (look.y - orbit.look.y) * u,
      z: orbit.look.z + (look.z - orbit.look.z) * u,
    },
    eye: {
      x: orbit.eye.x + (groupEye.x - orbit.eye.x) * u,
      y: orbit.eye.y + (groupEye.y - orbit.eye.y) * u,
      z: orbit.eye.z + (groupEye.z - orbit.eye.z) * u,
    },
  };
}

export const LAST_LOOK = Object.freeze({
  OFF: 'off',
  LIVE: 'live',
  CUT: 'cut',
  GONE: 'gone',
});

/**
 * 0 at the start of the swing, 1 at/after contact. The bed lerps the sledge
 * head toward the seated aim by this amount so the Attack floor-chop still
 * plays and the HEAD still arrives on the visor.
 */
export function contactMix(phase, contact = HIT_CONTACT) {
  const p = Number(phase);
  const c = Number(contact);
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (!Number.isFinite(c) || c <= 0) return p >= 1 ? 1 : 0;
  if (p >= c) return 1;
  return p / c;
}

/** World lerp of the sledge head toward the seated torso/head. */
export function retargetHead(head, aim, mix) {
  const m = Math.min(1, Math.max(0, Number(mix) || 0));
  return {
    x: head.x + (aim.x - head.x) * m,
    y: head.y + (aim.y - head.y) * m,
    z: head.z + (aim.z - head.z) * m,
  };
}

export function occupies(head, torso, slack = HIT_SLACK) {
  if (!head || !torso) return false;
  const dx = head.x - torso.x;
  const dy = head.y - torso.y;
  const dz = head.z - torso.z;
  return Math.hypot(dx, dy, dz) <= slack;
}

/**
 * B is the main picture when a nominator walks. Showrunner (first nominator
 * already taken — no ninth robot) degrades B to A: hold the accused from
 * outside the ring. C still plays for the contact frame either way.
 */
export function execCamMode({ showrunner, executionerId } = {}) {
  const id = executionerId == null ? '' : String(executionerId);
  if (showrunner === true || id === SHOWRUNNER) return 'A';
  return 'B';
}

/**
 * Last-look C. Armed the moment the accused is on the block (walk-up + hit).
 * HARD-CUTS on death — no fade, no linger. Off-air / black is one frame
 * (`cut`), then the box is gone. `consumeCut` is the renderer's one-frame tick.
 */
export function stepLastLook(state, { armed = false, dead = false, consumeCut = false } = {}) {
  const cur = state || LAST_LOOK.OFF;
  if (cur === LAST_LOOK.GONE) return LAST_LOOK.GONE;
  if (cur === LAST_LOOK.CUT) return consumeCut ? LAST_LOOK.GONE : LAST_LOOK.CUT;
  if (cur === LAST_LOOK.LIVE) {
    if (dead) return LAST_LOOK.CUT;
    if (!armed) return LAST_LOOK.OFF;
    return LAST_LOOK.LIVE;
  }
  if (armed && !dead) return LAST_LOOK.LIVE;
  return LAST_LOOK.OFF;
}

export function lastLookLive(state) {
  return state === LAST_LOOK.LIVE;
}

export function lastLookOnAir(state) {
  return state === LAST_LOOK.LIVE || state === LAST_LOOK.CUT;
}

/**
 * CAST10 lingerWreck: `wreck=true sit=false` is the vanish (body not holding
 * wreckPose). A wrecked victim is planted for the rest of the night — sit is
 * true. Never parkSit a wrecked body. The onFloor heuristic photographed Eli
 * as sit=false at EXECUTION 9s when pos.y was a hip, not a missing corpse.
 */
export function wreckSit(r) {
  if (r?.wrecked) return true;
  return !!r?.seated;
}

/**
 * CAST11 H483 photograph. State `wreck=true` with `snap.wreck=undefined`
 * / `wreckPose=false` was the vanish — the mesh was planted and the snap
 * had no row for it. Always defined: wreck, sit, wreckPose. A wrecked
 * body is sit=true (planted) and wreckPose is the u=1 mesh, never false.
 */
export function wreckSnap(r, { cx = 0, cz = 0, floorY = 0 } = {}) {
  const wrecked = !!r?.wrecked;
  if (!wrecked) {
    return { wreck: false, sit: wreckSit(r), wreckPose: false };
  }
  const pose = r.wreckPose && Number.isFinite(Number(r.wreckPose.y))
    ? r.wreckPose
    : wreckPose({
      sitAt: r.sitAt, face: r.face ?? 0, u: 1, cx, cz, floorY,
    });
  return { wreck: true, sit: true, wreckPose: pose };
}

/**
 * Kinematic un-sit. Body skids tangent + outward so the chair can go the
 * other way. `u` is 0 at contact, 1 when the wreck has read.
 */
export function wreckPose({ sitAt, face = 0, u = 0, cx = 0, cz = 0, floorY = 0 } = {}) {
  const k = Math.min(1, Math.max(0, Number(u) || 0));
  const ease = k * k * (3 - 2 * k);
  const ox = (sitAt?.x ?? 0) - cx;
  const oz = (sitAt?.z ?? 0) - cz;
  const olen = Math.hypot(ox, oz) || 1;
  const ux = ox / olen;
  const uz = oz / olen;
  const tx = -uz;
  const tz = ux;
  /*
   * 📺 HEAT · ON THE BACK, NOT A PLANK. Pitch ~1.52 lays them supine. A small
   * roll is slack, not a crawl. Tangent skid keeps the torso off the chair.
   */
  return {
    x: (sitAt?.x ?? 0) + ux * 0.28 * ease + tx * 0.82 * ease,
    y: floorY,
    z: (sitAt?.z ?? 0) + uz * 0.28 * ease + tz * 0.82 * ease,
    facing: face + 0.40 * ease,
    pitch: 1.52 * ease,
    roll: 0.22 * ease,
    // Frozen last-contact frame — never a Sit_* hold on a posed settle.
    clip: null,
  };
}

/**
 * Separate object. Outward + topple, no shared motion with the body.
 * `u` is 0 at breakout, 1 when the chair has finished falling.
 */
export function chairTopple({ seat, u = 0, cx = 0, cz = 0 } = {}) {
  const k = Math.min(1, Math.max(0, Number(u) || 0));
  const ease = k * k * (3 - 2 * k);
  const ox = (seat?.x ?? 0) - cx;
  const oz = (seat?.z ?? 0) - cz;
  const olen = Math.hypot(ox, oz) || 1;
  const ux = ox / olen;
  const uz = oz / olen;
  const tx = -uz;
  const tz = ux;
  const y0 = seat?.y ?? 0;
  /*
   * Further out, slight opposite tangent — not under the torso. Sofa HEAT:
   * the old 0.62 m outward sat the chair where a prone idle read as a push-up.
   */
  return {
    x: (seat?.x ?? 0) + ux * 1.18 * ease - tx * 0.22 * ease,
    y: y0 + 0.06 * Math.sin(Math.PI * ease) * (1 - ease),
    z: (seat?.z ?? 0) + uz * 1.18 * ease - tz * 0.22 * ease,
    rotX: 1.35 * ease,
    rotY: (seat?.rotY ?? 0) + 0.55 * ease,
    rotZ: 0.42 * ease,
  };
}

/** Seated visor above the cushion, looking into the ring. C's eyeline. */
export function chairEyeline({ chair, cx = 0, cz = 0, height = 1.14 } = {}) {
  const x = chair?.x ?? 0;
  const z = chair?.z ?? 0;
  const y = (chair?.y ?? 0) + height;
  const ix = cx - x;
  const iz = cz - z;
  const ilen = Math.hypot(ix, iz) || 1;
  return {
    x: x + (ix / ilen) * 0.18,
    y,
    z: z + (iz / ilen) * 0.18,
  };
}

/**
 * B's settled wreck camera, and the talk plate after `setExecute('','')`.
 * `body` / `chair` are world XZ (live mesh or finished wreckPose / chairTopple).
 */
export function wreckCam({ body, chair, cx = 0, cz = 0, floorY = 0 } = {}) {
  const bx = body?.x ?? 0;
  const bz = body?.z ?? 0;
  const kx = chair?.x ?? bx;
  const kz = chair?.z ?? bz;
  const look = {
    x: (bx + kx) * 0.5,
    y: floorY + WRECK_LOOK_Y,
    z: (bz + kz) * 0.5,
  };
  const mx = look.x - cx;
  const mz = look.z - cz;
  const mlen = Math.hypot(mx, mz) || 1;
  const ux = mx / mlen;
  const uz = mz / mlen;
  const tx = -uz;
  const tz = ux;
  return {
    look,
    eye: {
      x: look.x - ux * 2.35 + tx * 0.85,
      y: floorY + WRECK_EYE_Y,
      z: look.z - uz * 2.35 + tz * 0.85,
    },
  };
}

/**
 * Finished wreck + the plate that holds it. Used when the execute phase is
 * off — a late watcher, Recap / Debrief / Casting / Reunion — so the director
 * finds the floor body instead of an empty chair gap.
 */
export function wreckLook({ sitAt, seat, face = 0, cx = 0, cz = 0, floorY = 0 } = {}) {
  const body = wreckPose({ sitAt, face, u: 1, cx, cz, floorY });
  const chair = chairTopple({ seat: seat || sitAt, u: 1, cx, cz });
  return { ...wreckCam({ body, chair, cx, cz, floorY }), body, chair };
}

/** Talk cycle: do not append a wreck plate. Linger was the 10s hold after contact. */
export function talkCycleShots(base, hasWreck) {
  const shots = Array.isArray(base) ? base : [];
  void hasWreck;
  return shots.filter((s) => !(s?.name === WRECK_SHOT.name && (Number(s.dur) || 0) >= 10));
}

/** Which named plate is on at `clock`. THREE-free so the gate can prove wreck is visited. */
export function talkShotAt(clock, shots) {
  const list = Array.isArray(shots) && shots.length ? shots : [WRECK_SHOT];
  const cycle = list.reduce((s, x) => s + (Number(x.dur) || 0), 0) || 1;
  let t = Math.max(0, Number(clock) || 0) % cycle;
  for (let i = 0; i < list.length; i++) {
    const dur = Number(list[i].dur) || 0;
    if (t < dur) return list[i];
    t -= dur;
  }
  return list[list.length - 1];
}

/**
 * 📺 HEAT · DEATH IS THE FACE ONLY. Shell / mint / bezel keep living albedo.
 * The visor screen and the face lamp go out. Bezel is the white frame, not the
 * screen — do not crash it. Gate: execute-hit H15.
 */
export function isFaceScreenName(name) {
  const s = String(name || '').toLowerCase();
  if (/bezel/.test(s)) return false;
  return /faceplate|unit4h\.face|facescreen|facelamp|face.?lamp|face.?light|eyelight/.test(s)
    || (/\bvisor\b/.test(s) && !/bezel/.test(s));
}

/** Fallback seated torso/head when the Head bone is missing (unit4h). */
export function seatedAim({ sitAt, chair, cx = 0, cz = 0, height = 1.12 } = {}) {
  const x = sitAt?.x ?? chair?.x ?? 0;
  const z = sitAt?.z ?? chair?.z ?? 0;
  const y0 = sitAt?.y ?? chair?.y ?? 0;
  const ix = cx - x;
  const iz = cz - z;
  const ilen = Math.hypot(ix, iz) || 1;
  return {
    x: x + (ix / ilen) * 0.06,
    y: y0 + height,
    z: z + (iz / ilen) * 0.06,
  };
}
