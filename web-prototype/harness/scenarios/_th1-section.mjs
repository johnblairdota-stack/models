/**
 * 🧱 **DOES THE BREAK EDGE READ AS A SECTION? ONE CRATER, ONE CAMERA, ONE FROZEN PAGE.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_th1-section.mjs \
 *        --port 5411 --q "seed=s4&dig=1" --shots
 *
 * John, looking at a fixed breach: *"I can't tell at a glance."* And, on the same picture:
 * *"I also want to add some thickness to the cyan wall."* `critic-slice-3`, independently:
 * *"the break edge is an ink outline, not a section… cyan is a flat card with a straight
 * aliased edge."*
 *
 * 🎯 **THE MEASUREMENT IS THE NUMBER OF PIXELS BETWEEN THE WHITE AND THE CYAN.** That is the
 * whole defect stated as a quantity: the shell is 146 mm of material and every one of its
 * shading terms — round 6's monotone cut ramp, round 9's sill/soffit spread, round 10's cyan
 * core in section — is painted across the part-eaten band, whose width on screen is
 * `uCutSoft / |grad(_order - _dmgB)|`. At the END of a dig the crater is saturated and that
 * gradient is a cliff, so the band is one pixel and every one of those terms lands on it.
 *
 * ⚠️ **THE A/B IS A UNIFORM, SO BOTH ARMS ARE THE SAME BUILD, THE SAME CRATER, THE SAME CAMERA
 * AND THE SAME FRAME** — `breakmask.js` `uSecFloor` emits identical GLSL at every value (checked
 * by sha1 in `harness/_thick1-glslsha.mjs`), so `secFloor` 0 IS the pre-round-12 build, live,
 * in the page. That is `dig.md`'s own reusable trick.
 *
 * ⚠️ Park and settle with the sim RUNNING before `hold()` — `harness/still.mjs` says why.
 * ⚠️ Two frames per station: the offset boom (the wall is the subject) and the SHIPPED boom
 * (what John actually sees, robot and all). `critic-slice-3` measured the body at 45.7-52.6%
 * of an opening's screen area, so a shot composed for the wall is not the shipped picture.
 */

import { hold, release } from '../still.mjs';
/**
 * 🚨 **THE SHIPPED ARM IS IMPORTED, NEVER NAMED — AND THIS FILE FAILED A CORRECT BUILD FOR TWO
 * HOURS BECAUSE IT WAS NAMED** (`pace-2`, 2026-08-09). The sweep below prices five candidates;
 * the headline assertion then has to read the one that actually ships. It was written as
 * `read['5px-cap6']` while `wall.js` shipped `[6, 10]`, so the gate asserted an arm nobody
 * builds and read **mean 2.57 -> 2.67 px against its own 4x-the-floor bar**, i.e. red on a
 * green tree. The arm that ships reads **2.57 -> 3.18 px, median 1 -> 2**, and passes with room.
 *
 * 🎯 **THE FIX IS THE GENERAL ONE: A SWEEP MUST NAME ITS SHIPPED ARM BY IMPORTING IT.** The arm
 * list is now BUILT from `SEC_FLOOR`, so the shipped row is present, labelled `SHIPPED`, and
 * cannot drift from `wall.js` again — change the constant and this file re-points itself.
 */
import { SEC_FLOOR } from '../../src/game/wall.js';

const HELPERS = () => {
  const W = window;
  W.__th1 = {
    faces: () => W.__rrr.engine.room.panels.filter((p) => p.spec?.free && p.field),
    /** a body-sized excavation on ONE face, competent aim, every blow through the brush */
    dig(p, blows, loU = 0.30, hiU = 0.70) {
      const g = p.field;
      const cx0 = Math.max(0, Math.floor(loU * g.cols));
      const cx1 = Math.min(g.cols - 1, Math.ceil(hiU * g.cols));
      const cy0 = Math.floor(0.30 / g.cellH);
      const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
      for (let k = 0; k < blows; k++) {
        let bx = cx0, by = cy0, bd = 2;
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const d = g.depth[g.idx(cx, cy)];
          if (d < bd) { bd = d; bx = cx; by = cy; }
        }
        p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
      }
      g.flush();
      return blows;
    },
    park(p, back = 2.6, shoulder = 1.25) {
      const e = W.__rrr.engine, room = e.room;
      const ch = p.openChannel();
      const n = p.normal, c = p.pointAt(ch.open ? ch.centreU : 0.5, 0.46);
      e.player.pos.set(c.x + n.x * back, room.floorY, c.z + n.z * back);
      e.player.vel.set(0, 0, 0);
      const yaw = Math.atan2(c.x - e.player.pos.x, c.z - e.player.pos.z);
      e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
      e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
      e.cam.shoulder = shoulder;
      return { back, shoulder };
    },
    /**
     * The breach's own screen rect, projected through the LIVE camera — never typed in.
     * ⚠️ **WIDER THAN `_st1-remain`'s, AND THE FIRST RUN OF THIS SCENARIO SHOWS WHY.** That one
     * measures the breach's INTERIOR (is there a black void in it), so 0.62 x 0.55 m is right.
     * This one measures the RIM, so the rect has to contain the rim: at 0.62 m the crater filled
     * it edge to edge, the walk out of the fill never reached shell, and it read `0 rows`.
     */
    rect(p, halfW = 1.35, halfH = 1.20) {
      const e = W.__rrr.engine;
      const cam = e.cam?.camera ?? e.camera;
      const ch = p.openChannel();
      const c = p.pointAt(ch.open ? ch.centreU : 0.5, 0.46);
      const n = p.normal;
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const w = c.clone();
        w.x += -n.z * sx * halfW; w.z += n.x * sx * halfW; w.y += sy * halfH;
        const pr = w.project(cam);
        const nx = (pr.x + 1) / 2, ny = (1 - pr.y) / 2;
        x0 = Math.min(x0, nx); x1 = Math.max(x1, nx);
        y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
      }
      return [x0, y0, Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0)].map((v) => +v.toFixed(4));
    },
    /**
     * Set the section's screen floor on EVERY dig face's innermost layer. `v === null` restores
     * whatever the build shipped, read once and kept, so the "now" arm is the build and not a
     * number this scenario typed.
     */
    secFloor(v) {
      let n = 0, seen = null;
      for (const p of W.__th1.faces()) {
        const u = p.mats?.[3]?.userData?.breakUniforms;
        if (!u?.uSecFloor) continue;
        u.__shipped ??= u.uSecFloor.value.clone();
        if (v === null) u.uSecFloor.value.copy(u.__shipped);
        else u.uSecFloor.value.set(v[0], v[1]);
        seen = [u.uSecFloor.value.x, u.uSecFloor.value.y]; n++;
      }
      return { faces: n, value: seen };
    },
    calls() {
      const r = W.__rrr.engine.renderer ?? W.__rrr.engine.pipeline?.renderer;
      return { calls: r?.info?.render?.calls ?? -1, programs: r?.info?.programs?.length ?? -1 };
    },
  };
  return true;
};

/**
 * 📏 **THE SECTION'S WIDTH, IN PIXELS, READ OFF THE DELIVERED FRAME.**
 *
 * Per scanline: find the first CYAN pixel, then walk outward while the pixel is not SHELL, and
 * count. That run is everything the wall has between its white face and the fill — the cut
 * face, the contact line and round 10's cyan core band. It is exactly what "an ink outline, not
 * a section" is a complaint about, and it is one number.
 *
 * ⚠️ Classified on hue, not on luma, because the grade moves luma and the two materials differ
 * in CHROMA by a mile: the shell is neutral-to-warm, the fill is blue-over-red by ~90 units.
 */
async function sectionWidth(page, png, box) {
  const b64 = png.toString('base64');
  return page.evaluate(async ([data, r]) => {
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${data}`; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const x0 = Math.max(0, Math.round(r[0] * img.width));
    const y0 = Math.max(0, Math.round(r[1] * img.height));
    const w = Math.min(img.width - x0, Math.round(r[2] * img.width));
    const h = Math.min(img.height - y0, Math.round(r[3] * img.height));
    const d = cx.getImageData(x0, y0, w, h).data;
    const at = (x, y) => {
      const i = (y * w + x) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    };
    /**
     * Four materials, by HUE and value, because the grade moves luma and these four differ in
     * chroma by a mile. FILL is the barrier's own flat teal; CORE is round 10's section band,
     * the same hue at a third of the value; SHELL is the pale plaster face; WARM is the room
     * (boiserie, frame, floor), which must never be counted as section.
     */
    const isFill = ([R, G, B]) => (B - R) > 45 && (G - R) > 35 && G > 110;
    const isCore = ([R, G, B]) => (B - R) > 18 && (G - R) > 12 && G <= 110;
    const isWarm = ([R, G, B]) => (R - B) > 24;
    const isShell = ([R, G, B]) => {
      const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      return l > 105 && (B - R) < 18 && (R - B) < 62;
    };
    const runs = [];
    let fill = 0, core = 0, shell = 0, warm = 0, sect = 0;
    for (let y = 0; y < h; y++) {
      let firstFill = -1;
      for (let x = 0; x < w; x++) {
        const p = at(x, y);
        if (isFill(p)) { fill++; if (firstFill < 0) firstFill = x; } else if (isShell(p)) shell++;
        else if (isCore(p)) { core++; sect++; } else if (isWarm(p)) warm++;
        else sect++;
      }
      if (firstFill <= 0) continue;
      // walk out of the fill until the shell face is reached; that run IS the section
      let n = 0, x = firstFill - 1;
      while (x >= 0 && !isShell(at(x, y)) && !isWarm(at(x, y)) && n < 80) { n++; x--; }
      // only rows that actually reached surviving shell — a row that walks into the room is not
      // measuring a break edge, it is measuring the panel's own boundary
      if (x >= 0 && isShell(at(x, y))) runs.push(n);
    }
    runs.sort((a, b) => a - b);
    const q = (f) => (runs.length ? runs[Math.min(runs.length - 1, Math.floor(f * runs.length))] : -1);
    const N = w * h;
    return {
      rows: runs.length,
      median: q(0.5), p25: q(0.25), p75: q(0.75),
      mean: runs.length ? +(runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(2) : -1,
      cyanPct: +(100 * fill / N).toFixed(2),
      corePct: +(100 * core / N).toFixed(2),
      sectPct: +(100 * sect / N).toFixed(2),
      shellPct: +(100 * shell / N).toFixed(2),
      warmPct: +(100 * warm / N).toFixed(2),
      px: N,
    };
  }, [b64, box]);
}

export default async function th1({ page, note, pass, fail, skip, shot, snap }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.evaluate(HELPERS);

  const arm = await page.evaluate(() => window.__rrr.engine.room.digCensus().mode);
  if (arm !== 'free') { skip('free arm', `mode=${arm}`); return; }

  const wait = async (n) => { for (let i = 0; i < n; i++) await page.waitForTimeout(40); };

  // =========================================================================
  // STATION 1 — JOHN'S FRAME: a gallery DUD dug to the end. Cyan behind, breach fixed.
  // =========================================================================
  const s1 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__th1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const c = room.digCensus();
    const gal = H.faces().filter((p) => p.spec.a === 'gallery');
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    // ⚠️ dig.md: a drive lands its blows inside one frame, so the debris cloud covers the exact
    // surface under test. Null both hooks, as `dig-promoted.mjs` does.
    p.onChunk = null; p.onBreak = null;
    if (p.twin) { p.twin.onChunk = null; p.twin.onBreak = null; }
    /**
     * 44 blows — `visible-1`'s own "opened" mark. ⚠️ **70 WAS TRIED FIRST AND IS THE WRONG
     * FRAME:** with this aim the crater eats the whole 2.56 m face, so the only boundary left in
     * the picture is the PANEL's own rectangle against un-dug ornate wall, and there is no break
     * edge to measure. (That state is worth its own look — see the report — but it is not this
     * measurement.)
     */
    const blows = H.dig(p, 44);
    return { id: p.id, blows, shipped: H.secFloor(null), park: H.park(p, 2.6, 1.25) };
  });
  note('');
  note('STATION 1 — a gallery dud dug out (the fixed breach), cyan behind');
  note(`   face ${s1.id} · ${s1.blows} blows · secFloor ships at `
    + `[${s1.shipped.value}] on ${s1.shipped.faces} faces`);
  if (!(s1.shipped.faces > 0)) {
    fail('uSecFloor reaches the innermost layer of every dig face',
      `found ${s1.shipped.faces} faces carrying the uniform`);
    return;
  }
  pass('uSecFloor reaches the innermost layer of every dig face',
    `${s1.shipped.faces} faces at [${s1.shipped.value}]`);

  await wait(45);
  const pinned = await hold(page);
  note(`   held: ${JSON.stringify(pinned.pinned)}`);
  await wait(4);
  const BOX = await page.evaluate((fid) => {
    const p = window.__th1.faces().find((q) => q.id === fid);
    return window.__th1.rect(p);
  }, s1.id);
  note(`   breach rect on screen (projected, not typed): ${JSON.stringify(BOX)}`);

  /**
   * 🎯 **EVERY CANDIDATE, ON ONE CRATER, FROM ONE CAMERA, IN ONE FROZEN PAGE.** `uSecFloor` emits
   * identical GLSL at every value, so the arms differ in nothing but two floats — no second
   * build, no second boot, no second seed. `[0, 0]` IS the pre-round-12 build.
   */
  /**
   * ⚠️ **`SHIP` IS THE IMPORTED CONSTANT, AND IT IS DEDUPED OUT OF THE CANDIDATE LIST** — see
   * the import. A candidate that happens to equal the shipped value would otherwise be shot and
   * measured twice and appear as two rows of the same arm.
   */
  const SHIP = [SEC_FLOOR[0], SEC_FLOOR[1]];
  const same = (v) => v[0] === SHIP[0] && v[1] === SHIP[1];
  const ARMS = [
    ['was', [0, 0]], ['4px-cap4', [4, 4]], ['5px-cap6', [5, 6]],
    ['6px-cap10', [6, 10]], ['8px-cap20', [8, 20]],
  ].filter(([, v]) => !same(v));
  ARMS.splice(1, 0, [`SHIPPED-${SHIP[0]}px-cap${SHIP[1]}`, SHIP]);
  ARMS.push(['floor', [0, 0]]);
  const read = {};
  for (const [name, v] of ARMS) {
    await page.evaluate((val) => window.__th1.secFloor(val), v);
    await wait(2);
    const png = await snap(`th1-s1-${name}`);
    if (name !== 'floor') await shot(`th1-section-${name}`);
    read[name] = await sectionWidth(page, png, BOX);
  }
  const info = await page.evaluate(() => window.__th1.calls());
  await page.evaluate(() => window.__th1.secFloor(null));
  await release(page);

  note('   arm          section px (med / mean)   fill %   section %   core %   shell %');
  for (const [name] of ARMS) {
    const m = read[name];
    note(`   ${name.padEnd(11)}  ${String(m.median).padStart(4)} / ${String(m.mean).padStart(6)}`
      + `           ${String(m.cyanPct).padStart(6)}   ${String(m.sectPct).padStart(7)}`
      + `   ${String(m.corePct).padStart(6)}   ${String(m.shellPct).padStart(6)}`);
  }
  note(`   in-page renderer: ${info.calls} calls · ${info.programs} programs`);

  const was = read.was, floorArm = read.floor;
  const floorD = Math.abs(floorArm.mean - was.mean);
  note(`   same-config floor (was vs was): |Δmean| ${floorD.toFixed(3)} px, `
    + `|Δfill| ${Math.abs(floorArm.cyanPct - was.cyanPct).toFixed(3)} pp`);
  // 🚨 the arm that SHIPS, keyed off the imported constant — never a typed arm name. See the import.
  const ship = read[`SHIPPED-${SHIP[0]}px-cap${SHIP[1]}`];
  if (ship.mean - was.mean > 4 * Math.max(0.05, floorD)) {
    pass('the break edge is a section rather than an outline',
      `mean ${was.mean} -> ${ship.mean} px, median ${was.median} -> ${ship.median}, `
      + `against a same-config floor of ${floorD.toFixed(3)}`);
  } else {
    fail('the break edge is a section rather than an outline',
      `mean ${was.mean} -> ${ship.mean} px, floor ${floorD.toFixed(3)}`);
  }

  /**
   * 🚨 **THE TRADE ROUND 11 HAD TO PAY, PRICED RATHER THAN ASSUMED.** Widening a ramp that is
   * CENTRED on the tear leaves the 50% contour alone, but the fragment survives while
   * `_front < 1`, so the fully-open contour does move inward by half the widening — i.e. a wider
   * section is paid for in fill, in pixels, and the only question is how many. `critic-dig-4`
   * asked for *"nearly the whole breach"* and round 11 already spent 8 points of it.
   */
  const fillDelta = ship.cyanPct - was.cyanPct;
  if (Math.abs(fillDelta) < 2.5) {
    pass('the section is nearly free in cyan fill',
      `${was.cyanPct}% -> ${ship.cyanPct}% of the breach rect (${fillDelta.toFixed(2)} pp)`);
  } else {
    fail('the section is nearly free in cyan fill',
      `${was.cyanPct}% -> ${ship.cyanPct}% (${fillDelta.toFixed(2)} pp)`);
  }

  // =========================================================================
  // STATION 2 — THE SAME CRATER FROM THE SHIPPED BOOM. What John actually sees.
  // =========================================================================
  await page.evaluate((fid) => {
    const p = window.__th1.faces().find((q) => q.id === fid);
    window.__th1.park(p, 2.6, 0.42);
  }, s1.id);
  await wait(45);
  await hold(page);
  await wait(4);
  await shot('th1-player-eye-NOW');
  await page.evaluate(() => window.__th1.secFloor([0, 0]));
  await wait(2);
  await shot('th1-player-eye-WAS');
  await page.evaluate(() => window.__th1.secFloor(null));
  await release(page);
  note('');
  note('STATION 2 — the SHIPPED boom (shoulder 0.42), the frame John is looking at');
  pass('the player-eye frame is on disk both arms',
    'game.play.th1-player-eye-{NOW,WAS}.png');

  // =========================================================================
  // STATION 3 — MID-DIG. The state round 11 optimised, so it cannot have regressed.
  // =========================================================================
  const s3 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__th1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const c = room.digCensus();
    const gal = H.faces().filter((p) => p.spec.a === 'gallery');
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    p.onChunk = null; p.onBreak = null;
    if (p.twin) { p.twin.onChunk = null; p.twin.onBreak = null; }
    const blows = H.dig(p, 20);
    return { id: p.id, blows, park: H.park(p, 2.6, 1.25) };
  });
  await wait(45);
  await hold(page);
  await wait(4);
  const BOX3 = await page.evaluate((fid) => {
    const p = window.__th1.faces().find((q) => q.id === fid);
    return window.__th1.rect(p);
  }, s3.id);
  const n3 = await snap('th1-s3-now');
  await shot('th1-middig-NOW');
  await page.evaluate(() => window.__th1.secFloor([0, 0]));
  await wait(2);
  const w3 = await snap('th1-s3-was');
  await shot('th1-middig-WAS');
  await page.evaluate(() => window.__th1.secFloor(null));
  await release(page);
  const m3n = await sectionWidth(page, n3, BOX3);
  const m3w = await sectionWidth(page, w3, BOX3);
  note('');
  note(`STATION 3 — the same face at ${s3.blows} blows (mid-dig, round 11's state)`);
  note(`   section width — WAS median ${m3w.median} px / mean ${m3w.mean} · `
    + `NOW median ${m3n.median} / mean ${m3n.mean}`);
  note(`   fill — WAS ${m3w.cyanPct}% · NOW ${m3n.cyanPct}% · shell ${m3w.shellPct}% -> ${m3n.shellPct}%`);
  note(`   section — WAS ${m3w.sectPct}% (core ${m3w.corePct}%) · NOW ${m3n.sectPct}% (core ${m3n.corePct}%)`);
  if (Math.abs(m3n.cyanPct - m3w.cyanPct) < 2.5) {
    pass('mid-dig fill is unmoved too', `${m3w.cyanPct}% -> ${m3n.cyanPct}%`);
  } else {
    fail('mid-dig fill is unmoved too', `${m3w.cyanPct}% -> ${m3n.cyanPct}%`);
  }
}
