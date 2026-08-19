/**
 * THE HOLE IN THE DRAW-CALL ACCOUNTING HANDOFF NAMES AS UNMEASURED:
 * **worst-case draw calls with the ballroom's dig faces ACTUALLY DUG.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_calls1-dug.mjs \
 *        --port 5243 --q "seed=s4"
 *   ... --q "seed=s4&loose=0"    # the same sweep with the residency cull for loose items OFF
 *
 * `digcover-1` priced five NEW dig edges at +6 calls total and said so honestly: that figure is
 * for PRISTINE faces, which cost nothing because a pristine face joins an instance group that
 * already exists. **A face that has taken one blow leaves the group** — `wall.js` `pristine` is
 * false the moment `field.hits.length` is non-zero — and draws its own five meshes for the rest
 * of the round. So the real question is not what the edges cost, it is what they cost DUG, and
 * nobody had asked it.
 *
 * ONE BLOW PER FACE IS THE WHOLE DRIVE, DELIBERATELY. De-instancing is a boolean: the first hit
 * flips `pristine` and every hit after it changes the picture but not the draw set. Driving 63
 * blows per face would take twenty minutes and measure the same number, and it would also fire
 * `onBreak` 2000 times — `dig-promoted.mjs` records that debris and dust are parented to the
 * SCENE, so residency never hides them and they add calls at stations that cannot see a segment.
 * `onBreak` is suppressed for the same reason it is there.
 *
 * Three states, each a superset of the last:
 *   PRISTINE     nothing hit
 *   BALLROOM     one blow on every face of `bal_west` + `bal_east` (the two ballroom edges)
 *   WHOLE HOUSE  one blow on every free face in the building — the absolute ceiling
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

export default async function dug({ page, note, pass, fail, skip }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const c = e.room.panelCensus();
    const free = e.room.panels.filter((p) => p.spec?.free);
    const byEdge = {};
    for (const p of free) byEdge[p.spec.edge] = (byEdge[p.spec.edge] ?? 0) + 1;
    return { mode: c.mode, panels: c.panels, pristine: c.pristine, free: free.length, byEdge,
      loose: e.room.looseCensus ? e.room.looseCensus() : null };
  });
  note(`walls "${head.mode}" · ${head.panels} panels (${head.pristine} pristine)`
    + ` · ${head.free} free dig faces: ` + Object.entries(head.byEdge).map(([k, v]) => `${k}=${v}`).join(' '));
  note(`loose-item residency cull: ${head.loose ? JSON.stringify(head.loose) : 'NOT PRESENT on this build'}`);
  if (!head.free) { skip('the dug worst case is bounded', 'this build has no free dig faces'); return; }

  const hit = (edges) => page.evaluate((edges) => {
    const e = window.__rrr.engine;
    const seg = e.room.panels.filter((p) => p.spec?.free
      && (edges === 'all' || edges.includes(p.spec.edge)));
    const saved = seg.map((p) => p.onBreak);
    for (const p of seg) p.onBreak = null;         // this is not an FX probe — see the header
    for (const p of seg) p.damage(1e5, { weapon: 'nailgun' });
    seg.forEach((p, i) => { p.onBreak = saved[i]; });
    const c = e.room.panelCensus();
    return { driven: seg.length, promoted: c.panels - c.pristine };
  }, edges);

  const sweep = async (label) => {
    const rows = [];
    for (const name of STATIONS) {
      const ok = await page.evaluate((n) => {
        const e = window.__rrr.engine;
        const a = e.room.anchor(n);
        if (!a) return false;
        e.player.pos.set(a.x, e.room.floorY, a.z);
        e.player.vel.set(0, 0, 0);
        e.cam._first = true;
        return true;
      }, name);
      if (!ok) continue;
      await step(40);
      const r = await page.evaluate(() => {
        const e = window.__rrr.engine;
        const c = e.room.panelCensus();
        return { calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
          ownMeshes: c.ownMeshes, spaces: e.room.visibleSpaces() };
      });
      rows.push({ name, ...r });
    }
    const worst = rows.reduce((a, b) => (b.calls > a.calls ? b : a));
    note(`${label}: worst ${worst.name} ${worst.calls} calls / ${worst.tris} tris · `
      + rows.map((x) => `${x.name.split('.')[0].slice(0, 4)}.${x.name.split('.')[1].slice(0, 3)} ${x.calls}`).join(' · '));
    note(`${' '.repeat(label.length)}  panel own-meshes drawn: ` + rows.map((x) => x.ownMeshes).join('/'));
    return { rows, worst };
  };

  const a = await sweep('PRISTINE  ');
  const ball = await hit(['bal_west', 'bal_east']);
  note(`one blow on each of ${ball.driven} ballroom dig faces -> ${ball.promoted} panels promoted`);
  const b = await sweep('BALL DUG  ');
  const all = await hit('all');
  note(`one blow on each of ${all.driven} free faces in the house -> ${all.promoted} promoted`);
  const c = await sweep('HOUSE DUG ');

  note(`WORST STATION, one page, three states: ${a.worst.calls} (${a.worst.name}) -> `
    + `${b.worst.calls} (${b.worst.name}, +${b.worst.calls - a.worst.calls}) -> `
    + `${c.worst.calls} (${c.worst.name}, +${c.worst.calls - a.worst.calls})`);

  c.worst.calls <= 625 && c.worst.tris <= 900000
    ? pass('the DUG house still fits the draw-call budget',
      `every free face in the house hit: worst ${c.worst.name} ${c.worst.calls}/625, `
      + `${c.worst.tris}/900k tris (+${c.worst.calls - a.worst.calls} over pristine)`)
    : fail('the DUG house still fits the draw-call budget',
      `worst ${c.worst.name} ${c.worst.calls}/625 calls, ${c.worst.tris}/900k tris`);
  b.worst.calls <= 625
    ? pass('the BALLROOM dug fits the draw-call budget',
      `${ball.driven} ballroom faces hit: worst ${b.worst.name} ${b.worst.calls}/625 `
      + `(+${b.worst.calls - a.worst.calls} over pristine)`)
    : fail('the BALLROOM dug fits the draw-call budget',
      `worst ${b.worst.name} ${b.worst.calls}/625`);
}
