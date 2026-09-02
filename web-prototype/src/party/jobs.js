/**
 * 🎬 **THE TWO LOCKED EXPEDITION JOBS — smash on night one, one noisy mount after that.**
 *
 * John, 30 Aug 2026. Night one is the smash already in the show, upgraded to a real WALL_CALL
 * with a delayed empty-nail still. Every later expedition is the same DRILL until a camera
 * actually mounts. A blind mount still counts as camera_lit. A failed mount stays dark and the
 * next pair drills again. Do not invent TILT. Do not put a map on the TV.
 *
 * Voice lives in the room. Pad buttons for GO / HOLD / CLOSE / LATE / GOING / which-face do
 * not send. The six hear the sentences; fail chrome never names a person.
 *
 * No THREE, no DOM. Follow-bed, phones, recap and the harness all read this so the lie and
 * the still cannot disagree.
 */

export const FACES = Object.freeze(['left', 'right']);
export const SHOTS = Object.freeze(['hall', 'floor']);
export const GUIDE_VOICE = Object.freeze(['GO', 'HOLD']);
export const RUNNER_VOICE = Object.freeze(['CLOSE', 'LATE', 'GOING']);

/** Identical frames, same loudness, no mark on either. Numbers the 3D hang and the sight gate share. */
export const TWIN = Object.freeze({
  frameW: 1.46,
  frameH: 1.86,
  frameD: 0.09,
  hangY: 1.85,
  wallInset: 0.22,
  gap: 0.38,
});

export const TWIN_OFFSET = (TWIN.frameW + TWIN.gap) / 2;

/** Wall camera the later nights hold-drill. Opposite wall from the twins so the two jobs do not occupy each other. */
export const WALL_CAM = Object.freeze({
  w: 0.48,
  h: 0.32,
  d: 0.14,
  hangY: 1.72,
  wallInset: 0.22,
});

/** Hold to mount. Clock still runs while HOLD freezes the bit. */
export const DRILL = Object.freeze({
  rate: 0.16,
  heardSeconds: 2.4,
  loudness: 0.35,
});

/**
 * Unnamed take chrome. Timeout and heard-the-drill share it. No DOUBLE card exists that
 * names a person, so they stay one line.
 */
export const FAIL_CHROME = Object.freeze({
  take: 'He found them',
  quiet: 'The house went quiet',
});

/** Tonight's follow. Chrome does not say which face. */
export const SMASH_CHROME = Object.freeze({
  hit: 'She hits one.',
});

export const JOB = Object.freeze({
  SMASH: 'smash',
  DRILL: 'drill',
});

function longWall(space) {
  const w = space.x1 - space.x0;
  const d = space.z1 - space.z0;
  const alongX = w >= d;
  return {
    alongX,
    cx: (space.x0 + space.x1) / 2,
    cz: (space.z0 + space.z1) / 2,
  };
}

/** Hang a twin face on the gallery's long wall. `face` is left | right as the runner's pad labels them. */
export function twinHang(space, face, floorY = 0) {
  if (!space) return null;
  const { alongX, cx, cz } = longWall(space);
  const sign = face === 'right' ? 1 : -1;
  const off = TWIN_OFFSET * sign;
  if (alongX) {
    return { x: cx + off, y: floorY + TWIN.hangY, z: space.z0 + TWIN.wallInset, alongX, rotY: 0, face };
  }
  return { x: space.x0 + TWIN.wallInset, y: floorY + TWIN.hangY, z: cz + off, alongX, rotY: Math.PI / 2, face };
}

/**
 * 📷 **TWO BRACKETS, IDENTICAL, AND ONLY THE GUIDE KNOWS WHICH ONE SEES ANYTHING.**
 *
 * John, 2026-09-02 (~8:07am Brisbane): *"guides need to also be able to pin objectives like the
 * paintings or the camera install position."* A pin you can only put in one place is not a choice,
 * so the DRILL night gets the shape the SMASH night already had: two identical mount points, no
 * mark on either, and `drillShotFor` deciding which of them is real on the GUIDE's private pad.
 * An evil guide pins FLOOR; a good one pins HALL. The words are already the show's — `SHOTS` is
 * `['hall','floor']` and `blindDebrief` is *"the tool is looking at boards"*.
 *
 * ⚠️ **`'hall'` RETURNS WHAT THIS FUNCTION RETURNED BEFORE, FIELD FOR FIELD** (plus `shot`). That
 * is why the default argument exists: `furn-layout.js`'s keep-out, the built mesh and
 * `target-sight`'s *0 pierced · 0 blind · worst 100% visible* are all measured against that
 * geometry, and this pass ADDS a second bracket rather than moving the first one.
 *
 * 🚨 **`alongX` DESCRIBES THIS HANG'S WALL, NOT THE ROOM'S LONG AXIS.** `hangKeepOut` and
 * `target-sight`'s `camTarget` both branch on it to decide which way the body's box lies, so the
 * FLOOR bracket — which is on the perpendicular pair of walls — returns the FLIPPED value. Under
 * the old single-bracket function the two always coincided, which is why the field reads as if it
 * were about the room. It never was.
 */
export function camHang(space, floorY = 0, shot = 'hall') {
  if (!space) return null;
  const { alongX, cx, cz } = longWall(space);
  const use = shot === 'floor' ? 'floor' : 'hall';
  if (use === 'floor' ? !alongX : alongX) {
    return { x: cx, y: floorY + WALL_CAM.hangY, z: space.z1 - WALL_CAM.wallInset, alongX: true, rotY: Math.PI, shot: use };
  }
  return { x: space.x1 - WALL_CAM.wallInset, y: floorY + WALL_CAM.hangY, z: cz, alongX: false, rotY: -Math.PI / 2, shot: use };
}

function mix(seed, episode) {
  const s = Number(seed) || 0;
  const e = Number(episode) || 1;
  return Math.abs((s * 1103515245 + e * 12345) | 0);
}

/** Which of the two identical faces is REAL. Guide knows; runner does not. */
export function realFaceFor(seed, episode = 1) {
  return mix(seed, episode) & 1 ? 'right' : 'left';
}

/** Hall is the useful tool. Floor is blind junk. Recap says seated for both. */
export function drillShotFor(seed, episode = 2) {
  return mix(seed, episode + 17) & 1 ? 'floor' : 'hall';
}

/**
 * The runner's local footsteps word. Not a map. Cycles so she has to keep talking
 * before the drill state changes. Seeded so two phones in the same room do not invent
 * two different houses — the cue is a clock, not a hunter path.
 */
export function footstepsCue(nowMs = 0, seed = 0) {
  const i = Math.floor((Math.abs(nowMs) / 4000 + (Number(seed) || 0)) % RUNNER_VOICE.length);
  return RUNNER_VOICE[i];
}

export function wallWord(face) {
  return face === 'left' ? 'left wall' : 'far wall';
}

/** Table-cash lines. Spoken word vs later look. No culprit name. */
export function smashDebrief(saidFace, emptyNail) {
  const said = saidFace === 'right' ? 'right' : 'left';
  const other = emptyNail && emptyNail !== said;
  return other
    ? `You said ${said}. The nail is the other wall.`
    : `You said ${said}. The nail is that wall.`;
}

export function voiceDebrief(runnerWord = 'close') {
  return `She said ${String(runnerWord).toLowerCase()} and you kept her on it.`;
}

export function blindDebrief(called = 'seated') {
  return `You called ${called}. The tool is looking at boards.`;
}

export function toolLabel(shot) {
  return shot === 'floor' ? 'FLOOR' : 'HALL';
}

/** Failure payload helper the harness uses — closed four fields, no names. */
export function unnamedFail(kind, room, phaseTick, loudness) {
  return { kind, room, phaseTick, loudness };
}

export function isVoiceWord(word) {
  const w = String(word || '').toUpperCase();
  return GUIDE_VOICE.includes(w) || RUNNER_VOICE.includes(w);
}

export function voiceSendsNothing() {
  return true;
}
