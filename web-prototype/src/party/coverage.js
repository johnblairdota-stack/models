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
 * ⚠️ **THIS PARAGRAPH USED TO SAY FULL COVERAGE ARRIVES ONLY AS THE GAME ENDS, AND IT WAS WRONG
 * ON BOTH NUMBERS IT NAMED.** It read *"at 7-8 players the third camera is the win condition, so
 * the guide becomes an oracle exactly as the game ends. At 4-6 players two cameras win and
 * coverage caps at 4 of 6 rooms."* `WIN_TARGETS` asks for THREE lights at 4-5 players and FOUR at
 * 6-8, and coverage is total from the SECOND light — because the establishing camera is one of
 * only three that exist. So full coverage arrives one or two lights BEFORE the objective does,
 * and it does not make the guide an oracle when it gets there: the blind strip holds the honest
 * error at 15.9%, inside T3's 15-25% band. Both halves are measured in §BAND below; `guide-coverage`
 * C2b/C2d gate the band and C5 gates the gap between saturation and the objective.
 *
 * No THREE, no DOM.
 */

/**
 * 🏚️ **THE HOUSE'S OWN SIX SPACES, BY THEIR OWN IDS.**
 *
 * 🚨 THESE USED TO BE INVENTED, AND THE INVENTION SURVIVED UNTIL THE EXPEDITION WAS WIRED UP.
 * The party mode named its rooms before there was a mansion to name — `hall` and `cellar` do not
 * exist in `spaces.js` at all, and `study` is ambiguous between the two studies. Every coverage
 * number, every camera roster and every caption was therefore about a house nobody could walk
 * through. They are the engine's `SPACES` ids now, and `expedition-wire` E1 pins them to
 * `spaces.js` so the two can never drift again.
 *
 * ⚠️ DECLARED HERE RATHER THAN IMPORTED, BECAUSE `spaces.js` IMPORTS THREE. This module has to
 * run in a worker and in bare node — that is the whole reason the coverage rules are testable —
 * so the list is stated and the GATE does the importing. A pure module that reached for the
 * engine would take `party-sim`, `guide-coverage` and `party-isolation` down with it.
 */
export const ROOMS = ['ballroom', 'gallery', 'study_w', 'study_e', 'service', 'chapel'];

/**
 * 🚨 **THE ESTABLISHING CAMERA — LIVE FROM FRAME ONE, AND IT IS NOT PART OF THE OBJECTIVE.**
 *
 * Two different numbers were being kept in one field and it made the scoreboard lie. `build-brief`
 * §S3: *"The show starts with one camera live, because at zero coverage the guide is a coin and
 * can never be caught lying"* — that is a COVERAGE fact, and it is why episode one sits at 33%
 * rather than 50% honest error. It is not something the crew lit, so it is not something the win
 * machine counts: `win.js` folds `run.camera_lit` entries, of which there are zero at the start.
 *
 * So `cameras.unlocked` counts what the crew has earned, from zero, and is the number the
 * scoreboard prints against `cameras.needed`; coverage asks `camerasLive()` for the number of
 * cameras actually watching rooms. One field was doing both jobs, seeded at 1 and compared
 * against a target counted from 0, and the television read `3/3` with every pip lit at episode
 * two of a game that ran on to a displayed `5/3`.
 */
export const ESTABLISHING_CAMS = 1;

/** How many cameras are watching rooms, given how many the crew has lit. */
export const camerasLive = (lit) => lit + ESTABLISHING_CAMS;

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
 * The guide is asked *"is it safe to move"*. They have a definite answer when they can SEE the
 * Hunter and must guess otherwise, and a guess is right about half the time:
 *
 *     honest error ~= (1 - P(seen)) / 2
 *
 * 🚨 **AND `P(seen)` IS NOT COVERAGE. IT WAS READ AS COVERAGE FOR AS LONG AS THIS COMMENT HAS
 * EXISTED, AND THAT MADE THE WHOLE CURVE WRONG AT THE TOP END.** `darkrun.js`'s header names a
 * second, independent source of honest error that is pure geometry: a wall of height `H` seen at
 * elevation θ hides `H / tan θ` of floor behind it — 2.55 m at the shipped 4.80 m storey and 62°
 * tilt, which is exactly where a stationary Hunter stands. `session.js`'s `sightForGuide()`
 * composes the two, and it is the composition that ships:
 *
 *     P(seen) = coverage x (1 - P(inside the blind strip))
 *
 * With the wall distance drawn uniformly over [0, 8) m the strip takes 31.9% of draws, so at FULL
 * coverage the honest error is **15.9%, not 0%** — the guide never becomes an oracle, which is the
 * property the mode rests on and which coverage alone could not deliver.
 *
 * ⚠️ THE OLD NUMBERS IN THIS COMMENT WERE ALSO OFF BY ONE CAMERA. Coverage is asked about
 * `camerasLive(lit)`, not about `lit` — the establishing camera is live from frame one — so a
 * curve indexed by the scoreboard's count reads one column to the left of the game's.
 *
 * Measured through the shipped composition, and these are `guide-coverage`'s own printed numbers
 * rather than a restatement of them (C2; the middle column is the term that makes the difference):
 *
 * ```
 *   lit 0 -> 1 live cam  · coverage  33.3% · sees the Hunter 22.9% · honest error 38.5%
 *   lit 1 -> 2 live cams · coverage  66.7% · sees the Hunter 45.6% · honest error 27.2%
 *   lit 2 -> 3 live cams · coverage 100.0% · sees the Hunter 68.2% · honest error 15.9%
 *   lit 3 -> 4 live cams · coverage 100.0% · sees the Hunter 68.2% · honest error 15.9%
 *   lit 4 -> 5 live cams · coverage 100.0% · sees the Hunter 68.2% · honest error 15.9%
 * ```
 *
 * 🚨 **THE TAIL IS FLAT AND THE OBJECTIVE RUNS INTO IT.** `ROOMS.length / ROOMS_PER_CAM` is 3, so
 * three cameras exist, and the establishing camera is one of them — coverage is total from the
 * SECOND light onward while `WIN_TARGETS` asks for three (4-5p) or four (6-8p). State it as the
 * count it is, because "one or two" is the kind of phrasing a number hides behind:
 *
 *     **1 DEAD CAMERA LIGHT AT A 4-5 PLAYER TABLE. 2 AT A 6-8 PLAYER TABLE.**
 *
 * A dead light still wins the match — it buys the GUIDE nothing, because there is no sixth room
 * left to reveal. That is a design decision about the camera table and three documents disagree
 * about it (`win.js`'s `WIN_TARGETS` header records all three), so nothing here has been changed
 * to paper over it: `guide-coverage` C5 measures the gap, prints the dead lights by table size,
 * and pins them so they cannot widen unnoticed.
 *
 * T3 wants 15-25%. The band is entered at the second light and held for the rest of the show —
 * and full coverage is **not** an oracle, which is the half of this that is good news.
 */

/** Coverage alone, with no blind strip. The FIRST of the two sources, and never the whole answer. */
export const expectedHonestError = (c) => (1 - c) / 2;

/**
 * Both sources compounded — the arithmetic `session.js`'s `sightForGuide()` performs.
 * @param {number} c      coverage fraction
 * @param {number} blind  the share of wall distances that fall inside the blind strip
 */
export const expectedHonestErrorSeen = (c, blind) => (1 - c * (1 - blind)) / 2;

export const T3_BAND = Object.freeze({ lo: 0.15, hi: 0.25 });
