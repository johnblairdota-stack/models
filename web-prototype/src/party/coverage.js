/**
 * 📹 **COVERAGE — what the guide can actually see, and why that is the whole game.**
 *
 * Showstopper **S3**. `src/views/game.js` L2559 gates the guide's hunter mark on
 *
 *     hunterMark.visible = hs.inScene && !!hp;
 *
 * — that is, on the Hunter existing. It is drawn `depthTest:false` beside its hearing ring and
 * its sight cone. A guide holding that has a **zero honest error rate**, Task Contract **T3**
 * fails, and every task in the deck degrades from a deduction game into a lie detector. It is a
 * debug view; the audit read it as a game mechanic and was wrong.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FIX IS ALSO THE OBJECTIVE, AND THAT IS WHY IT IS THE BEST MECHANIC IN THE BATCH.
 * ---------------------------------------------------------------------------------------------
 * The guide sees the Hunter **only in rooms a live camera covers**. Unlocking cameras is already
 * how good wins (`party-loop.md`), so one resource now drives four systems: the objective, the
 * guide's sight, the Director's shot list, and the audience's sense that the show is improving.
 *
 * Round one the guide is nearly blind and genuinely guessing. By the last round they have real
 * coverage. **The honest error rate stops being zero and becomes a number you can tune** — which
 * is what makes the guide's lie survivable, because nobody but the guide knows how much they
 * could see.
 *
 * ⚠️ FULL COVERAGE IS REACHABLE ONLY AT THE MOMENT GOOD HAS ALREADY WON, and that is fine
 * rather than a hole: at 7-8 players the third camera is the win condition, so the guide becomes
 * an oracle exactly as the game ends. At 4-6 players two cameras win and coverage caps at 4 of 6
 * rooms, so it is never full at all.
 *
 * No THREE, no DOM.
 */

/** The prototype's six spaces (`src/game/spaces.js`, "All six spaces dig and hold John's minute"). */
export const ROOMS = ['ballroom', 'gallery', 'study', 'chapel', 'hall', 'cellar'];

/** Each camera covers two rooms. Two is the number that puts the mid-game in T3's band — see §BAND. */
export const ROOMS_PER_CAM = 2;

/**
 * The roster, derived from the world seed so both ends agree without transmitting it —
 * `run.js` L43-48's doctrine, which is correct here because camera SITES are geometry, not cast.
 */
export function cameraRoster(worldSeed) {
  let a = (worldSeed >>> 0) || 1;
  const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const pool = ROOMS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const cams = [];
  for (let i = 0; i < pool.length; i += ROOMS_PER_CAM) {
    cams.push({ id: `cam${cams.length + 1}`, rooms: pool.slice(i, i + ROOMS_PER_CAM) });
  }
  return cams;
}

/** The rooms a live camera watches. */
export function coveredRooms(worldSeed, unlocked) {
  const cams = cameraRoster(worldSeed);
  const set = new Set();
  for (let i = 0; i < Math.min(unlocked, cams.length); i++) for (const r of cams[i].rooms) set.add(r);
  return set;
}

export const coverageFraction = (worldSeed, unlocked) => coveredRooms(worldSeed, unlocked).size / ROOMS.length;

/**
 * 🚨 THE ONE CALL THAT REPLACES `hunterMark.visible = hs.inScene && !!hp`.
 * The Hunter is on the guide's map when a live camera watches the room it is in. Not otherwise,
 * and never because it merely exists.
 */
export function hunterVisibleToGuide({ worldSeed, unlocked, hunterRoom }) {
  return coveredRooms(worldSeed, unlocked).has(hunterRoom);
}

/**
 * §BAND — the guide's honest error rate, and where the number comes from.
 *
 * The guide is asked *"is it safe to move"*. With coverage `c` they have a definite answer with
 * probability `c`, and must guess otherwise. A guess is right about half the time, so
 *
 *     honest error ~= (1 - c) / 2
 *
 * T3 wants 15-25%, which puts coverage at **0.50-0.70** — one to two cameras of three, i.e. the
 * middle of a game. Episode one sits deliberately ABOVE the band (a nearly blind guide) and the
 * final episode below it (a guide who has earned their sight). `guide-coverage` C2 reports the
 * curve rather than asserting one number, because a band that must hold at every episode would
 * be asserting that progression does not happen.
 */
export const expectedHonestError = (c) => (1 - c) / 2;
export const T3_BAND = Object.freeze({ lo: 0.15, hi: 0.25 });
