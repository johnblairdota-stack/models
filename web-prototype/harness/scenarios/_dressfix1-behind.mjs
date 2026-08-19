/**
 * 🚧 **WHERE CAN A BODY ACTUALLY STAND? — `dressfix-1`, 2026-08-15.**
 *
 * John, on a generated house: *"there is like an outside perimeter wall randomly I can get behind
 * it and it has the weird grey dark room beyond thing going on."*
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dressfix1-behind.mjs \
 *        --port 5511 --q "plan=gen&planseed=3&seed=s4"
 *
 * ⚠️ `--q`, NEVER `--extra`. ⚠️ `?plan=gen&planseed=N`; `?estate=gen` turns the art port off.
 * ⚠️ The PLAN seed is frozen at module scope, so a seed sweep is one page load per seed.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 IT IS A COLLIDER QUESTION AND IT IS ANSWERED BY DRIVING A BODY, NOT BY READING GEOMETRY
 * ---------------------------------------------------------------------------------------------
 * A geometric answer ("is there a wall there") is the wrong question twice over: this project's
 * dominant defect is a wall you can SEE and walk THROUGH, and its second is a collider you cannot
 * see. So the whole measurement is a BREADTH-FIRST FLOOD of the XZ plane in which every single
 * edge is a body walked from one cell centre to the next through
 * `room.collide(pos, 0.34, 1.70)` — the shipped call, the player's own radius and clear height.
 * Nothing here reads a mesh, a rect or a collider box to decide passability.
 *
 * Two kinds of flood, because the player has two lives:
 *   **IN**   ONE FLOOD PER SPACE, from each space's own interior, unioned. ⚠️ **Not one flood
 *            from the spawn, and the first build of this file made that mistake — C2 caught it.**
 *            `genplan.js` ships generated doors SHUT, so a single walk-only flood from the spawn
 *            reaches **1 of 16 spaces, 36 m²**, and B1/B2 then pass by describing a sealed room.
 *            Per-space is also the honest model of the played run: the dig puts the player in the
 *            next room, and the question "can I get behind a wall from in here" is asked of every
 *            room in the house rather than of the one he happened to start in.
 *   **OUT**  from a point in the LIVE yard, 2.0 m outside the exit panel — the escaped player.
 * Every reached cell is then classified by `room.spaceAt`, which is the game's own answer to
 * "am I in a room": INSIDE a space · VOID (inside the envelope, in no space) · OUTSIDE.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS — every one runs on EVERY run, and they exist so that
 *    "NOTHING IS BEHIND THE WALL" and "I COULD NOT FIND THE WALL" cannot look the same
 * ---------------------------------------------------------------------------------------------
 *   **C1  THE GHOST.** The identical flood, identical grid, identical frontier logic, with the
 *         collide step replaced by free movement. It MUST reach the outside and it MUST reach
 *         far more cells than the real body. Without it, a flood that reported "0 cells outside"
 *         would be indistinguishable from a flood that never expanded at all.
 *   **C2  THE FILL RAN, AND IT RAN IN EVERY ROOM.** Every space must be entered by its own flood,
 *         and the union must cover ALL of them. A flood trapped in its start cell reports a clean
 *         zero for every leak — which is exactly what a single spawn flood did here (1 of 16).
 *   **C3  THE OUT FLOOD MUST NOT GET IN.** Started in the yard with every panel closed, a body
 *         must not reach a single INSIDE cell. If it does, the house is open from the outside and
 *         that is the defect itself; if it cannot even fill the yard, the OUT flood is blind and
 *         its own zero means nothing — so it also asserts the yard is filled (> 20 cells).
 *   **C4  THE GRID CONTAINS THE ANSWER.** No reached cell may sit on the grid boundary. A flood
 *         that runs out of grid has been silently clipped and every count is a floor, not a count.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT ASSERTS
 * ---------------------------------------------------------------------------------------------
 *   B1  the IN flood reaches **no OUTSIDE cell** — you cannot get out of the house by walking.
 *   B2  the IN flood reaches **no VOID cell** — there is no walkable pocket inside the envelope
 *       that is in no room, which is what "behind a wall" looks like from the inside.
 *   B3  the OUT flood stays in the yard — the escaped player cannot walk round the house.
 * Each reports WHERE, in world coordinates, so a still can be parked at the worst one.
 */

const CELL = +(process.env.CELL ?? 0.40);
const SUB = 0.10;                 // body march sub-step, metres
const MARGIN = +(process.env.MARGIN ?? 14);   // how far past the envelope the grid reaches

const PAGE = `
  const E = () => window.__rrr.engine;
  const V3 = () => E().camera.position.constructor;

  /**
   * The flood. \`ghost\` swaps the body for a free-moving point and changes NOTHING else — same
   * grid, same frontier, same acceptance test — which is what makes it a control (C1).
   */
  const flood = (starts, cell, sub, margin, ghost) => {
    const e = E(), Vec = V3();
    const R = 0.34, PASSH = 1.70;
    const sp = e.room.spaces;
    let ex0=1e9, ex1=-1e9, ez0=1e9, ez1=-1e9;
    for (const s of sp) { if (s.x0<ex0)ex0=s.x0; if (s.x1>ex1)ex1=s.x1; if (s.z0<ez0)ez0=s.z0; if (s.z1>ez1)ez1=s.z1; }
    const gx0 = ex0 - margin, gz0 = ez0 - margin;
    const nx = Math.ceil((ex1 + margin - gx0) / cell), nz = Math.ceil((ez1 + margin - gz0) / cell);
    const cx = (i) => gx0 + (i + 0.5) * cell;
    const cz = (j) => gz0 + (j + 0.5) * cell;
    /**
     * ⚠️ **MULTI-SOURCE, AND A BLOCKED CELL IS NEVER MARKED.** The first build ran one BFS per
     * space and SUMMED the counts, which double-counts every cell two rooms can both reach — with
     * the doors open that read 84 804 cells against a 30 173-cell grid. A single BFS seeded from
     * every start is the union by construction. And a cell a body could not enter from the west
     * is left unmarked so it is retried from the north: marking it would let one bad approach
     * angle hide a real opening.
     */
    const seen = new Uint8Array(nx * nz);
    const q = [];
    for (const [sx, sz] of starts) {
      const i0 = Math.round((sx - gx0) / cell - 0.5), j0 = Math.round((sz - gz0) / cell - 0.5);
      if (i0 < 0 || j0 < 0 || i0 >= nx || j0 >= nz) return { err: 'start off grid' };
      if (seen[i0 * nz + j0]) continue;
      seen[i0 * nz + j0] = 1;
      q.push(i0 * nz + j0);
    }
    const pos = new Vec(0, e.room.floorY, 0);
    let edges = 0;
    const steps = Math.max(1, Math.round(cell / sub));
    while (q.length) {
      const k = q.pop();
      const i = (k / nz) | 0, j = k % nz;
      for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const nk = ni * nz + nj;
        if (seen[nk]) continue;
        edges++;
        const tx = cx(ni), tz = cz(nj);
        pos.set(cx(i), e.room.floorY, cz(j));
        const ux = di * sub, uz = dj * sub;
        for (let s2 = 0; s2 < steps; s2++) {
          pos.x += ux; pos.z += uz;
          if (!ghost) pos.copy(e.room.collide(pos, R, PASSH));
        }
        if (Math.hypot(pos.x - tx, pos.z - tz) > cell * 0.30) continue;   // NOT marked — see above
        seen[nk] = 1;
        q.push(nk);
      }
    }
    // ---- classify every reached cell with the GAME's own answer, never with a rect test
    const out = { nx, nz, gx0, gz0, cell, edges, inside: 0, voidN: 0, outside: 0, band: 0,
      env: [ex0, ex1, ez0, ez1], onEdge: 0, spaces: {}, worst: [], reached: 0 };
    const v = new Vec(0, 0, 0);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (seen[i * nz + j] !== 1) continue;
      out.reached++;
      if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) out.onEdge++;
      const X = cx(i), Z = cz(j);
      v.set(X, 0, Z);
      const s = e.room.spaceAt(v, 0);
      if (s) { out.inside++; out.spaces[s.id] = (out.spaces[s.id] || 0) + 1; continue; }
      /**
       * ⚠️ **A CELL IN A DOORWAY IS IN NO SPACE, AND THAT IS NOT A VOID.** \`spaceAt(v, 0)\` tests
       * the CLEAR extents, and consecutive spaces are separated by a 0.30 m wall band, so any
       * cell centre landing in a doorway or in the band reads null. Distance to the nearest space
       * rect is what separates "standing in a doorway" from "standing behind a wall": anything
       * within \`WALL_T\` 0.30 m (+ half a cell of quantisation) is the band. The first build of
       * this file counted those and reported 40 phantom void cells.
       */
      let gap = 1e9, near = null;
      for (const q of sp) {
        const dx = Math.max(q.x0 - X, 0, X - q.x1);
        const dz = Math.max(q.z0 - Z, 0, Z - q.z1);
        const d = Math.hypot(dx, dz);
        if (d < gap) { gap = d; near = q.id; }
      }
      const inEnv = X >= ex0 && X <= ex1 && Z >= ez0 && Z <= ez1;
      const band = gap <= 0.30 + cell * 0.5 + 1e-6;
      if (band) { out.band++; continue; }
      if (inEnv) out.voidN++; else out.outside++;
      if (out.worst.length < 400) out.worst.push({ x: +X.toFixed(2), z: +Z.toFixed(2),
        kind: inEnv ? 'VOID' : 'OUT', gap: +gap.toFixed(2), near });
    }
    return out;
  };
`;

export default async function behind({ page, note, pass, fail, skip }) {
  const evalPage = (body) => page.evaluate(`(() => {\n${PAGE}\n${body}\n})()`);
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const head = await evalPage(`
    const e = E();
    const x = e.exterior;
    const live = [];
    if (x && x.sites) for (const [id, s] of x.sites) if (s.live) live.push({ id,
      px: s.exit.panel.root.position.x, pz: s.exit.panel.root.position.z,
      nx: s.exit.panel.normal.x, nz: s.exit.panel.normal.z, outSign: s.exit.outSign });
    return { search: location.search, seed: String(e.run.seed), spaces: e.room.spaces.length,
      panels: e.room.panels.length, extSolids: e.room.exteriorSolids.length,
      spawn: { x: e.room.spawn.player[0].x, z: e.room.spawn.player[0].z }, live };
  `);
  note(`url ${head.search} · run seed "${head.seed}" · ${head.spaces} spaces · ${head.panels} panels`
    + ` · exterior colliders ${head.extSolids}`);
  if (!head.live.length) { fail('a live exit site exists', 'none — the OUT flood has nowhere to start'); return; }
  const L = head.live[0];
  const outX = L.px + L.nx * L.outSign * 2.0;
  const outZ = L.pz + L.nz * L.outSign * 2.0;
  note(`live exit ${L.id} at (${L.px.toFixed(2)}, ${L.pz.toFixed(2)}) — OUT flood starts at `
    + `(${outX.toFixed(2)}, ${outZ.toFixed(2)}), 2.0 m outside it`);

  const run = (starts, ghost) => evalPage(
    `return flood(${JSON.stringify(starts)}, ${CELL}, ${SUB}, ${MARGIN}, ${ghost ? 'true' : 'false'});`);

  const centres = await evalPage(
    'return E().room.spaces.map((s) => [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.id]);');
  /** ONE multi-source flood from every room — the union, by construction. See the header. */
  const IN = await run(centres.map((c) => [c[0], c[1]]), false);
  if (IN.err) { fail('the IN flood started', IN.err); return; }
  /** …and one per room as well, so a room that is sealed off on its own is visible in the report. */
  const perSpace = await evalPage(`
    const e = E();
    const rows = [];
    for (const s of e.room.spaces) {
      const f = flood([[(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2]], ${CELL}, ${SUB}, ${MARGIN}, false);
      if (f.err) { rows.push({ id: s.id, err: f.err }); continue; }
      rows.push({ id: s.id, reached: f.reached, voidN: f.voidN, outside: f.outside,
        band: f.band, spaces: Object.keys(f.spaces), own: !!f.spaces[s.id] });
    }
    return rows;
  `);
  const touched = new Set(Object.keys(IN.spaces));
  const ownOK = perSpace.filter((r) => r.own).length;
  const GH = await run([[head.spawn.x, head.spawn.z]], true);
  const OUT = await run([[outX, outZ]], false);
  for (const r of perSpace) {
    if (r.err) { note(`  ${r.id} — ${r.err}`); continue; }
    const bad = r.voidN + r.outside;
    note(`  ${String(r.id).padEnd(16)} ${String(r.reached).padStart(5)} cells`
      + ` (${(r.reached * CELL * CELL).toFixed(0).padStart(4)} m²) · spaces ${r.spaces.length}`
      + ` · band ${r.band} · void ${r.voidN} · outside ${r.outside}${bad ? '   🚨' : ''}`);
  }

  const fmt = (f) => `${f.reached} cells (${(f.reached * CELL * CELL).toFixed(0)} m²) — `
    + `inside ${f.inside} · wall band ${f.band} · void ${f.voidN} · outside ${f.outside}`
    + ` · on grid edge ${f.onEdge}`;
  note(`grid ${GH.nx} x ${GH.nz} at ${CELL} m, origin (${GH.gx0.toFixed(2)}, ${GH.gz0.toFixed(2)})`
    + ` · envelope x ${GH.env[0].toFixed(2)}..${GH.env[1].toFixed(2)} z ${GH.env[2].toFixed(2)}..${GH.env[3].toFixed(2)}`);
  note(`IN (one flood seeded from all ${centres.length} rooms)  ${fmt(IN)}   [${IN.edges} body marches]`);
  note(`GHOST ${fmt(GH)}   [${GH.edges} marches]`);
  note(`OUT   ${fmt(OUT)}   [${OUT.edges} body marches]`);
  note(`spaces entered by some flood: ${touched.size} of ${perSpace.length}`
    + ` · each flood found its OWN space: ${ownOK} of ${perSpace.length}`);

  const clump = (rows) => {
    const seen = [];
    for (const r of rows) {
      const near = seen.find((s) => Math.abs(s.x - r.x) < 3 && Math.abs(s.z - r.z) < 3 && s.kind === r.kind);
      if (near) {
        near.n++; near.x = (near.x * (near.n - 1) + r.x) / near.n; near.z = (near.z * (near.n - 1) + r.z) / near.n;
        if ((r.gap ?? 0) > near.gap) { near.gap = r.gap; near.near = r.near; }
      } else seen.push({ x: r.x, z: r.z, kind: r.kind, n: 1, gap: r.gap ?? 0, near: r.near ?? '?' });
    }
    return seen.sort((a, b) => b.n - a.n);
  };
  if (IN.worst.length) {
    note('🚨 places a WALKED body reached that are in no room:');
    for (const c of clump(IN.worst).slice(0, 10)) {
      note(`    ${c.kind} ~${c.n} cells around (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`
        + ` — up to ${c.gap.toFixed(2)} m clear of the nearest space (${c.near})`);
    }
  }
  if (OUT.worst.length) {
    const cl = clump(OUT.worst);
    note(`OUT flood footprint: ${cl.length} clusters, biggest around `
      + `(${cl[0].x.toFixed(2)}, ${cl[0].z.toFixed(2)}) with ~${cl[0].n} cells`);
  }

  // ---------------------------------------------------------------- the controls
  (GH.outside > 0 && GH.reached > IN.reached)
    ? pass('C1 GHOST CONTROL — the identical flood with no body reaches the outside',
      `ghost ${GH.reached} cells (${GH.outside} outside) against the body's ${IN.reached}`
      + ` (${IN.outside} outside) — so a zero below is the COLLIDER, not the search`)
    : fail('C1 GHOST CONTROL — the identical flood with no body reaches the outside',
      `ghost ${GH.reached}/${GH.outside} vs body ${IN.reached}/${IN.outside} — the flood cannot`
      + ' expand even without collision, so every count here is meaningless');

  (IN.inside > 0 && ownOK === perSpace.length && touched.size === perSpace.length)
    ? pass('C2 — every room got its own flood, and every room was entered',
      `${ownOK}/${perSpace.length} floods found their own space, ${touched.size}/${perSpace.length}`
      + ` spaces entered, ${IN.inside} inside cells over ${IN.edges} body marches`)
    : fail('C2 — every room got its own flood, and every room was entered',
      `${ownOK}/${perSpace.length} floods found their own space, ${touched.size}/${perSpace.length}`
      + ' spaces entered — a flood trapped in its start cell reports a clean zero for every leak');

  (OUT.reached > 20 && OUT.inside === 0)
    ? pass('C3 — the OUT flood filled the yard and could NOT get into the house',
      `${OUT.reached} cells outside, 0 inside a space`)
    : fail('C3 — the OUT flood filled the yard and could NOT get into the house',
      `${OUT.reached} cells reached, ${OUT.inside} of them inside a space`);

  (IN.onEdge === 0 && OUT.onEdge === 0)
    ? pass('C4 — no flood touched the grid boundary', `grid is envelope + ${MARGIN} m`)
    : fail('C4 — no flood touched the grid boundary',
      `IN ${IN.onEdge} · OUT ${OUT.onEdge} cells on the edge — the counts are clipped`);

  // ---------------------------------------------------------------- the assertions
  IN.outside === 0
    ? pass('B1 — a walked body cannot get OUTSIDE the house', `0 of ${IN.reached} reached cells`)
    : fail('B1 — a walked body cannot get OUTSIDE the house',
      `${IN.outside} cells (${(IN.outside * CELL * CELL).toFixed(1)} m²) outside the envelope`);

  IN.voidN === 0
    ? pass('B2 — a walked body cannot reach a VOID inside the envelope',
      `0 of ${IN.reached} reached cells are inside the envelope but in no room`)
    : fail('B2 — a walked body cannot reach a VOID inside the envelope',
      `${IN.voidN} cells (${(IN.voidN * CELL * CELL).toFixed(1)} m²) — this is "behind the wall"`);

  /**
   * ⚠️ **BOUNDED BY THE YARD'S OWN REGISTERED COLLIDERS, NOT BY AN ABSOLUTE AREA.** A fixed
   * "< 400 m²" was right for the ±6.0 m fallback box and would go red the moment a yard is
   * legitimately wider (`dressfix-1` widened the generated fallback to the wall run it stands in
   * front of, up to ±22 m). The honest statement is that the escaped body cannot leave the
   * enclosure the module actually registered, whatever size that is.
   */
  const yardArea = OUT.reached * CELL * CELL;
  const box = await evalPage(`
    const e = E();
    const b = e.room.exteriorSolids;
    if (!b.length) return null;
    let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for (const q of b) { x0=Math.min(x0,q.min.x); x1=Math.max(x1,q.max.x);
      z0=Math.min(z0,q.min.z); z1=Math.max(z1,q.max.z); }
    return { x0, x1, z0, z1, n: b.length };
  `);
  const escaped = box ? OUT.worst.filter((c) => c.x < box.x0 - 1 || c.x > box.x1 + 1
    || c.z < box.z0 - 1 || c.z > box.z1 + 1) : [];
  note(box ? `the live yard's ${box.n} registered colliders span x ${box.x0.toFixed(2)}..`
    + `${box.x1.toFixed(2)} z ${box.z0.toFixed(2)}..${box.z1.toFixed(2)}` : 'no exterior colliders');
  (box && escaped.length === 0)
    ? pass('B3 — the escaped body stays inside the enclosure the module registered',
      `${yardArea.toFixed(0)} m² reachable, every cell inside the ${box.n} yard colliders + 1 m`)
    : fail('B3 — the escaped body stays inside the enclosure the module registered',
      box ? `${escaped.length} of ${OUT.worst.length} sampled cells are outside the yard's own`
        + ` collider box — e.g. (${escaped[0]?.x}, ${escaped[0]?.z})`
        : 'no exterior colliders were registered at all');
  void skip;
}
