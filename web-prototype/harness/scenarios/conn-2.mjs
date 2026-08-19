/**
 * CONN-2 — CAN YOU SEE, IN PIXELS, WHICH CONNECTOR IS THE WAY OUT?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/conn-2.mjs \
 *        --port 5249 --shots --q "seed=rrr-test-1"                 # blind (the default)
 *   ...--q "seed=rrr-test-1&tells=marked"                          # the shipped rule
 *
 * `docs/design/procedural-map.md` §2 is a claim about a PICTURE, so it has to be settled with
 * one. `exterior-owner-2` measured the shipped tell at **+20.3 luma on the jamb strip in both
 * of the room's breathing phases** and shipped it as a feature; John's design says that number
 * must be ZERO. This is the same measurement, run on both rules from one build.
 *
 * ⚠️ THE METHOD, AND EVERY PART OF IT IS THERE BECAUSE SOMETHING ELSE LIED FIRST.
 *
 *  · ONE PAGE, ONE STATION, ONE STAGE. The arms differ only in `run.exitId`. `exterior-owner-2`
 *    flipped the site between live and chained with the SEED, which also changes the LOCK — so
 *    its "identical geometry" arms were a stage-1 plaster panel against a stage-0 chained one,
 *    i.e. two different walls. Here both arms are forced to stage 0 after the plan is applied,
 *    so the only thing that moves is the dressing.
 *  · THE BOOM IS SETTLED TO A STANDSTILL FIRST. `ThirdPersonCamera` LERPs its POSITION through
 *    geometry (only its length is raycast), so teleport-then-shoot fires mid-flight — that is
 *    how both arms of one A/B became a close-up of plaster.
 *  · THE BODY IS HIDDEN AND `dynamicRes` IS PINNED. The idle robot and a resampled frame each
 *    move a whole-frame diff by more than this signal.
 *  · A SAME-STATE PAIR IS TAKEN FIRST, AS THE NOISE FLOOR. The room's lights breathe and the
 *    grade's grain is animated; a difference smaller than the frame's own churn is not a tell.
 *  · THE CROP IS DERIVED FROM THE PANEL, PROJECTED. A hardcoded pixel rectangle five pixels off
 *    the jamb produced a confident, quantitative, entirely wrong finding on `light.dark` at 150
 *    samples. The aperture's own four corners are projected through the real camera instead.
 */

const SITE = process.env.SITE ?? null;

export default async function conn2({ page, note, pass, fail, skip, shot }) {
  const step = async (n = 3) => {
    const f0 = await page.evaluate(() => window.__rrr?.frames?.() ?? 0);
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(40);
      const f = await page.evaluate(() => window.__rrr?.frames?.() ?? 0);
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  // ---- rig: an in-page crop reader, so nothing is written to disk or decoded in node -------
  await page.evaluate(() => {
    if (window.__c2) return;
    window.__c2 = true;
    window.__cropStats = async (dataUrl, box) => {
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl;
      });
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const x = cv.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      const sx = img.width / window.innerWidth, sy = img.height / window.innerHeight;
      const bx = Math.max(0, Math.round(box.x0 * sx)), by = Math.max(0, Math.round(box.y0 * sy));
      const bw = Math.min(img.width - bx, Math.round((box.x1 - box.x0) * sx));
      const bh = Math.min(img.height - by, Math.round((box.y1 - box.y0) * sy));
      if (bw < 4 || bh < 4) return null;
      const d = x.getImageData(bx, by, bw, bh).data;
      let l = 0, rb = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        l += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        rb += d[i] - d[i + 2];
        n++;
      }
      return { luma: +(l / n).toFixed(3), rb: +(rb / n).toFixed(3), px: n, w: bw, h: bh };
    };
    window.__cropDiff = async (a, b, box) => {
      const load = (u) => new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u;
      });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const x = cv.getContext('2d', { willReadFrequently: true });
      const sx = w / window.innerWidth, sy = h / window.innerHeight;
      const bx = Math.max(0, Math.round(box.x0 * sx)), by = Math.max(0, Math.round(box.y0 * sy));
      const bw = Math.min(w - bx, Math.round((box.x1 - box.x0) * sx));
      const bh = Math.min(h - by, Math.round((box.y1 - box.y0) * sy));
      if (bw < 4 || bh < 4) return null;
      x.drawImage(ia, 0, 0); const A = x.getImageData(bx, by, bw, bh).data;
      x.clearRect(0, 0, w, h);
      x.drawImage(ib, 0, 0); const B = x.getImageData(bx, by, bw, bh).data;
      let sum = 0, n = 0, changed = 0, max = 0;
      for (let i = 0; i < A.length; i += 4) {
        const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
        sum += d; n++;
        if (d > 10) changed++;
        if (d > max) max = d;
      }
      return { mean: +(sum / n).toFixed(3), pct: +(100 * changed / n).toFixed(2), max };
    };
  });

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { mode: e.exterior?.tells ?? null, live: e.run.exitId, lock: e.run.lock.id,
      seed: String(e.run.seed), sites: e.exits.map((x) => x.site.id) };
  });
  if (!head.mode) { fail('the exterior is wired', 'engine.exterior missing'); return; }

  // The site under the lens. Default: the run's own live one, so the LIVE arm is the state the
  // run actually produces and the CHAINED arm is the counterfactual.
  const site = SITE && head.sites.includes(SITE) ? SITE : head.live;
  note(`seed "${head.seed}" · tells=${head.mode} · run's live site ${head.live} (${head.lock})`
    + ` · measuring ${site}`);

  // ---- park square-on, hide the body, pin the resolution -------------------
  const park = await page.evaluate((sid) => {
    const e = window.__rrr.engine;
    const x = e.exits.find((q) => q.site.id === sid);
    if (!x) return null;
    const p = x.panel;
    const n = p.normal;                         // +Z at rotY 0
    const inward = x.outSign > 0 ? -1 : 1;      // toward the room the panel belongs to
    const D = 3.4;
    const px = p.root.position.x + n.x * inward * D;
    const pz = p.root.position.z + n.z * inward * D;
    e.player.pos.set(px, e.room.floorY, pz);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(p.root.position.x - px, p.root.position.z - pz);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    e.cam.yaw = yaw; e.cam.pitch = -0.03; e.cam._first = true;
    // the idle robot is the largest moving thing in frame and it is not the subject
    e.player.root.visible = false;
    // dynamic resolution resamples the whole image when frame cost moves, which is
    // indistinguishable from a real change in a mean-|d| diff
    e.opts.dynamicRes = false;
    return { at: [+px.toFixed(2), +pz.toFixed(2)], yaw: +yaw.toFixed(3) };
  }, site);
  if (!park) { fail('the station could be parked', `no exit named ${site}`); return; }

  // settle the boom to a standstill — see the header
  let last = null, still = 0;
  for (let i = 0; i < 40 && still < 3; i++) {
    await step(5);
    const p = await page.evaluate(() => {
      const c = window.__rrr.engine.camera.position; return [c.x, c.y, c.z];
    });
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) < 0.002) still++;
    else still = 0;
    last = p;
  }

  /** Force the plan, then force the STAGE, so the arms differ only in dressing. */
  const setArm = (live) => page.evaluate(([sid, isLive]) => {
    const e = window.__rrr.engine;
    e.run.exitId = isLive ? sid : '__none__';
    e.applyExitPlan();
    for (const x of e.exits) {
      x.panel.state.stage = 0;
      x.panel.state.stageHealth = x.panel.state.defs[0].health;
      x.panel._recomputeBox(); x.panel._apply();
    }
    return { exitId: e.run.exitId, stage: e.exits.find((q) => q.site.id === sid).panel.state.stage };
  }, [site, live]);

  /** The aperture's own four corners, projected through the real camera, plus a margin. */
  const cropOf = () => page.evaluate((sid) => {
    const e = window.__rrr.engine;
    const x = e.exits.find((q) => q.site.id === sid);
    const p = x.panel;
    p.root.updateWorldMatrix(true, false);
    e.camera.updateMatrixWorld(true);
    const W = window.innerWidth, H = window.innerHeight;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    // The panel is a plane at `root.position` rotated by `rotY` about Y, so a local (lx, ly, 0)
    // is `(px + lx cos, py + ly, pz - lx sin)`. Written out rather than routed through a THREE
    // Vector3 because `three` is a bare specifier the page cannot import.
    const c = Math.cos(p.rotY), sn = Math.sin(p.rotY);
    for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ox = lx * p.width / 2, oy = ly * p.height / 2;
      const s = {
        x: p.root.position.x + ox * c,
        y: p.root.position.y + oy,
        z: p.root.position.z - ox * sn,
      };
      // world -> NDC
      const m = e.camera.matrixWorldInverse.elements, pm = e.camera.projectionMatrix.elements;
      const vx = m[0] * s.x + m[4] * s.y + m[8] * s.z + m[12];
      const vy = m[1] * s.x + m[5] * s.y + m[9] * s.z + m[13];
      const vz = m[2] * s.x + m[6] * s.y + m[10] * s.z + m[14];
      const cw = pm[3] * vx + pm[7] * vy + pm[11] * vz + pm[15];
      const cx = (pm[0] * vx + pm[4] * vy + pm[8] * vz + pm[12]) / cw;
      const cy = (pm[1] * vx + pm[5] * vy + pm[9] * vz + pm[13]) / cw;
      const sxp = (cx * 0.5 + 0.5) * W, syp = (-cy * 0.5 + 0.5) * H;
      x0 = Math.min(x0, sxp); x1 = Math.max(x1, sxp);
      y0 = Math.min(y0, syp); y1 = Math.max(y1, syp);
    }
    const mx = (x1 - x0) * 0.22, my = (y1 - y0) * 0.22;
    return {
      aperture: { x0, y0, x1, y1 },
      // the aperture plus the jamb band all round it — where every cue in this design lives
      box: { x0: Math.max(0, x0 - mx), y0: Math.max(0, y0 - my),
        x1: Math.min(W, x1 + mx), y1: Math.min(H, y1 + my) },
      W, H,
    };
  }, site);

  const shotUrl = async () => {
    const buf = await page.screenshot({ type: 'png' });
    return `data:image/png;base64,${buf.toString('base64')}`;
  };

  // ---- the noise floor: two frames of the SAME state, a few frames apart ---
  await setArm(false);
  await step(8);
  const crop = await cropOf();
  note(`crop from the panel's own corners: ${JSON.stringify({
    x0: Math.round(crop.box.x0), y0: Math.round(crop.box.y0),
    x1: Math.round(crop.box.x1), y1: Math.round(crop.box.y1) })} of ${crop.W}x${crop.H}`);
  if (crop.box.x1 - crop.box.x0 < 40 || crop.box.y1 - crop.box.y0 < 40) {
    fail('the aperture is in frame', `projected crop is ${Math.round(crop.box.x1 - crop.box.x0)}x${Math.round(crop.box.y1 - crop.box.y0)} px`);
    return;
  }

  const n0 = await shotUrl();
  const s0 = await page.evaluate(async ([u, b]) => window.__cropStats(u, b), [n0, crop.box]);
  await step(20);
  const n1 = await shotUrl();
  const s1 = await page.evaluate(async ([u, b]) => window.__cropStats(u, b), [n1, crop.box]);
  const floor = await page.evaluate(async ([a, b, box]) => window.__cropDiff(a, b, box), [n0, n1, crop.box]);
  note(`NOISE FLOOR (chained, 20 frames apart): luma ${s0.luma} -> ${s1.luma}`
    + ` (|d| ${Math.abs(s1.luma - s0.luma).toFixed(2)}) · mean|d| ${floor.mean} over ${floor.pct}% of the crop`);

  // ---- the arms -----------------------------------------------------------
  const arm = async (live, tag) => {
    const st = await setArm(live);
    await step(8);
    const url = await shotUrl();
    const a = await page.evaluate(async ([u, b]) => window.__cropStats(u, b), [url, crop.box]);
    await shot(`conn2-${head.mode}-${tag}`);
    note(`${tag.toUpperCase().padEnd(8)} stage ${st.stage} · crop luma ${a.luma} · r-b ${a.rb}`);
    return { url, ...a };
  };
  const chained = await arm(false, 'chained');
  const liveA = await arm(true, 'live');
  const d = await page.evaluate(async ([a, b, box]) => window.__cropDiff(a, b, box),
    [chained.url, liveA.url, crop.box]);

  const dLuma = +(liveA.luma - chained.luma).toFixed(3);
  const dRb = +(liveA.rb - chained.rb).toFixed(3);
  note(`LIVE minus CHAINED, same station, same stage 0: luma ${dLuma > 0 ? '+' : ''}${dLuma}`
    + ` · r-b ${dRb > 0 ? '+' : ''}${dRb} · mean|d| ${d.mean} over ${d.pct}% of the crop`);
  note(`ratio to this view's own noise floor: luma ${(Math.abs(dLuma) / Math.max(0.01, Math.abs(s1.luma - s0.luma))).toFixed(2)}x`
    + ` · mean|d| ${(d.mean / Math.max(0.01, floor.mean)).toFixed(2)}x`);

  // =========================================================================
  // The verdict, and it INVERTS with the mode — which is the point of the flag
  // =========================================================================
  if (head.mode === 'marked') {
    d.mean > floor.mean * 1.5
      ? pass('marked: the live exit is identifiable while closed',
        `mean|d| ${d.mean} against a ${floor.mean} floor (${(d.mean / floor.mean).toFixed(1)}x),`
        + ` luma ${dLuma > 0 ? '+' : ''}${dLuma} — this is the tell the shipped build was built to have`)
      : fail('marked: the live exit is identifiable while closed',
        `mean|d| ${d.mean} against a ${floor.mean} floor — the shipped tell did not reproduce`);
  } else if (head.mode === 'blind') {
    d.mean <= floor.mean * 1.5
      ? pass('blind: a closed live exit is not identifiable in the picture',
        `mean|d| ${d.mean} against this view's own ${floor.mean} floor (${(d.mean / floor.mean).toFixed(2)}x),`
        + ` luma ${dLuma > 0 ? '+' : ''}${dLuma} — flipping the run's answer onto this wall changes nothing on screen`)
      : fail('blind: a closed live exit is not identifiable in the picture',
        `mean|d| ${d.mean} against a ${floor.mean} floor (${(d.mean / floor.mean).toFixed(2)}x), luma ${dLuma}`);
  } else {
    skip('the dressing follows the mode', `tells=${head.mode}`);
  }

  // Restore, so a --keep session is not left lying about its own state.
  await page.evaluate((sid) => {
    const e = window.__rrr.engine;
    e.run.exitId = sid; e.applyExitPlan();
    e.player.root.visible = true;
  }, head.live);
}
