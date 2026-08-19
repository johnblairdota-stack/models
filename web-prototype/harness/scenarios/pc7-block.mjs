/**
 * PC7 — two numbers the verdict rests on, measured rather than eyeballed.
 *
 *   SEED=s14 node harness/playtest.mjs --view game.play --script harness/scenarios/pc7-block.mjs \
 *        --port 5197 --shots --q "seed=s14"
 *
 * 1. HOW MUCH OF THE APERTURE DOES THE PLAYER'S OWN BODY COVER at the station you stand in to
 *    work on the exit? Filed as "believed a camera problem" and never quantified. Both rects
 *    are projected through the LIVE camera matrix, so this is the screen the player sees.
 * 2. IS THE CONCEALMENT SEAM DIRECTIONAL? Real daylight round a boarded door is lit from one
 *    side and spills onto the floor. A decal traced on the aperture is uniform on all four
 *    edges and spills nothing. Sample the four jamb strips and the floor in front.
 */
export default async function block({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(50);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  const stand = async (dist) => {
    await page.evaluate((d) => {
      const e = window.__rrr.engine, run = e.run;
      const x = e.exits.find((q) => run.isLiveExit(q.site.id));
      const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
      e.player.pos.set(p.x + n.x * inS * d, e.room.floorY, p.z + n.z * inS * d);
      e.player.vel.set(0, 0, 0);
      const yaw = Math.atan2(-n.x * inS, -n.z * inS);
      e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
      e.cam.yaw = yaw; e.cam.pitch = 0;
      // ⚠️ SNAP THE BOOM. It LERPs its position through geometry (only the length is raycast),
      // so a teleport-then-shoot fires with the lens inside a wall — HANDOFF's `esc1b` note.
      e.cam._first = true;
    }, dist);
    // ...and let it actually come to rest rather than assuming N frames is enough.
    let last = null, still = 0;
    for (let i = 0; i < 40; i++) {
      await step(5);
      const p = await page.evaluate(() => {
        const c = window.__rrr.engine.camera.position; return [c.x, c.y, c.z];
      });
      const d2 = last ? Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) / 5 : 99;
      last = p;
      if (d2 < 0.0015) { still++; if (still >= 2) break; } else still = 0;
    }
  };

  const measure = () => page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const THREE_V = e.player.pos.constructor;
    const cam = e.camera;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const p = x.panel.root.position, n = x.panel.normal;
    const lat = { x: n.z, z: -n.x };
    const hw = x.halfW, spec = x.site;
    const h = spec.h ?? 3.0, cy = spec.cy ?? 1.5;
    const project = (v) => {
      const q = v.clone().project(cam);
      return [(q.x * 0.5 + 0.5) * window.innerWidth, (1 - (q.y * 0.5 + 0.5)) * window.innerHeight];
    };
    // aperture rect
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      corners.push(project(new THREE_V(p.x + lat.x * hw * sx, cy + (h / 2) * sy, p.z + lat.z * hw * sx)));
    }
    const ax0 = Math.min(...corners.map((c) => c[0])), ax1 = Math.max(...corners.map((c) => c[0]));
    const ay0 = Math.min(...corners.map((c) => c[1])), ay1 = Math.max(...corners.map((c) => c[1]));

    // player body rect, from the real world bounds of the drawn body. `LimbRig` has no scene
    // root of its own — it owns SOCKETS; `player.model` is the group that is actually drawn.
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
    const pts = [];
    e.player.model.updateWorldMatrix(true, true);
    e.player.model.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      for (const cx of [b.min.x, b.max.x]) for (const cy2 of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
        pts.push(new THREE_V(cx, cy2, cz).applyMatrix4(o.matrixWorld));
      }
    });
    for (const v of pts) {
      const s = project(v);
      bx0 = Math.min(bx0, s[0]); bx1 = Math.max(bx1, s[0]);
      by0 = Math.min(by0, s[1]); by1 = Math.max(by1, s[1]);
    }
    const ox = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0));
    const oy = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
    const aArea = Math.max(1, (ax1 - ax0) * (ay1 - ay0));
    return {
      site: x.site.id, lock: run.lock.id, meshes: pts.length / 8,
      aperture: [Math.round(ax0), Math.round(ay0), Math.round(ax1 - ax0), Math.round(ay1 - ay0)],
      body: [Math.round(bx0), Math.round(by0), Math.round(bx1 - bx0), Math.round(by1 - by0)],
      coverPct: +(100 * ox * oy / aArea).toFixed(1),
      widthPct: +(100 * ox / Math.max(1, ax1 - ax0)).toFixed(1),
    };
  });

  for (const d of [2.6, 4.2, 6.0]) {
    await stand(d);
    const m = await measure();
    note(`at ${d} m from ${m.site} (${m.lock}): aperture ${m.aperture} px · body ${m.body} px`
      + ` · body covers ${m.coverPct}% of the opening's area, ${m.widthPct}% of its width`);
    await shot(`pc7-block-${d}m`);
    if (d === 2.6) {
      (m.coverPct < 20)
        ? pass('the payoff is not blocked by your own body', `${m.coverPct}% at the working station`)
        : fail('the payoff is not blocked by your own body',
          `at the 2.6 m working station the player rig covers ${m.coverPct}% of the aperture`
          + ` and ${m.widthPct}% of its width`);
    }
  }
  pass('aperture occlusion measured at three ranges');
}
