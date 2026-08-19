/**
 * 🧱 **WHAT DOES AN UNTOUCHED DIG FACE ACTUALLY DRAW — and what did splitting the pristine
 * instance by room coat cost in groups and in draw calls?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_pris1-groups.mjs \
 *        --port 5459 --q "seed=s4&coat=1"     # ARMED — every pristine face must wear its room
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_pris1-groups.mjs \
 *        --port 5459 --q "seed=s4"            # ARM 0 — every pristine face must stay DAMASK, +0
 *
 * ⚠️ **`--q`, NEVER `--extra`.** ⚠️ **BOTH ARMS ARE PART OF THE RESULT.** Every assertion here
 * INVERTS between them, so a probe that had stopped reading the scene goes red on one of the two.
 *
 * ---------------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE WAS WRITTEN FOR
 * ---------------------------------------------------------------------------------------------
 * John: *"from the inside of the room the destructive wall IS the room asset — only when they
 * damage it can they see its white underneath."* `coatbake-1` measured the opposite off the built
 * scene: **28 of 28 free faces pristine · 28 of 28 instanced · 0 of 28 drawing their own layer 0.**
 * `wallinstances.js` drew every pristine face in the house from ONE shared `wall.pristine.face` —
 * the damask wallpaper stage — so `coat-1`'s per-room coat was invisible until a blow landed.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 W1 IS A MATRIX MATCH, NOT A BOOK-KEEPING READ, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------------
 * *"An instrument that re-derives the thing it measures will agree with it."* `wallinstances.js`
 * knows perfectly well which sub-group it put each face in, and asking it would prove nothing.
 * So W1 takes each pristine face's **world matrix** and searches every `wall.pristine.face*`
 * `InstancedMesh` in the scene for a SLOT whose `instanceMatrix` equals it, then reports THAT
 * mesh's material. That is the transform the GPU is handed, so it cannot agree with my grouping
 * by construction — only by being right.
 *
 * ⚠️ **`--pick` CANNOT SEE AN `InstancedMesh` AT ALL** (HANDOFF; `_ap1-who.mjs` is the version
 * that can), which is why this file does its own expansion rather than raycasting.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS — every one runs on EVERY run
 * ---------------------------------------------------------------------------------------------
 *   K1  **The recomputed group key reproduces `wallinstances.js`'s own**, character for
 *       character, off the live `InstancedMesh` NAMES. A mistyped `toFixed` would otherwise
 *       report a beautiful number about the wrong grouping.
 *   K2  **The predicted live face-group count IS the number of face meshes the scene draws**, at
 *       every station. Catches "I am projecting off a state nothing draws".
 *   K3  **On arm 0 the coat splits EXACTLY 0 groups** — arm 0 is the shipped build and the draw
 *       set must not move. Non-zero here is a regression on the arm John is not looking at.
 *   K4  **The free faces wear >1 coat on the armed arm and exactly 1 on arm 0** — without it, a
 *       "+0" would be indistinguishable from a probe that read one material 28 times.
 *   W2  **THE MATCHER MUST BE ABLE TO SAY NO.** The same search is run against every face's
 *       matrix displaced 1.234 m in Y — a transform no panel has — and must find NOTHING. Without
 *       W2, W1's "resolved" is unfalsifiable: "this face wears its room's coat" and "I could not
 *       resolve this face" have to be distinguishable, and this is what distinguishes them.
 *   W3  **Every live pristine face must be matched to exactly ONE mesh.** Two matches with
 *       different materials is an ambiguous transform and the run says so instead of picking one.
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

/** Everything the page needs, inlined into each evaluate — page context has no closure over this. */
const PAGE_HELPERS = `
  const apertureKey = (p) => {
    const a = p.apertures;
    if (!a?.length) return '';
    return '|ap:' + a.map((r) => r.u0.toFixed(5) + ',' + r.u1.toFixed(5) + ','
      + r.v0.toFixed(5) + ',' + r.v1.toFixed(5)).join(';');
  };
  const geoKey = (p) => p.width.toFixed(4) + 'x' + p.height.toFixed(4) + 'x'
    + p.thickness.toFixed(4) + apertureKey(p);
  const coatKey = (p, arm) => {
    if (!p.field || arm === 0) return '';
    const m = p.mats?.[0];
    if (!m) return '';
    const cc = ('clearcoat' in m) ? (m.clearcoat > 0 ? 'cc' : 'nocc') : 'nocc';
    return '|coat:' + m.type + '|' + cc + '|' + m.name;
  };
`;

export default async function pris1Groups({ page, note, pass, fail, skip }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  // ---------------------------------------------------------------- 0. the static picture
  const head = await page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const e = window.__rrr?.engine;
    if (!e) return { err: 'no engine' };
    const room = e.room;
    if (!room) return { err: 'no room' };
    const arm = Number(new URLSearchParams(location.search).get('coat') ?? 0) | 0;

    const sceneFace = [];
    let sceneReveal = 0;
    e.scene.traverse((o) => {
      if (!o.isInstancedMesh || typeof o.name !== 'string') return;
      if (o.name.startsWith('wall.pristine.face.')) {
        sceneFace.push({ full: o.name.slice('wall.pristine.face.'.length),
          count: o.count, mat: o.material?.name ?? '', type: o.material?.type ?? '',
          key: o.material?.customProgramCacheKey ? String(o.material.customProgramCacheKey()) : '' });
      } else if (o.name.startsWith('wall.pristine.reveal.')) sceneReveal++;
    });

    const panels = room.panels.map((p) => ({
      id: p.id, free: !!p.spec?.free,
      room: (p.ownerSpace?.root?.name ?? '').slice(6) || (p.spec?.a ?? '?'),
      geo: geoKey(p), coat: coatKey(p, arm),
      coatName: p.mats?.[0]?.name ?? '', coatType: p.mats?.[0]?.type ?? '',
      pristine: !!p.pristine,
    }));

    return {
      arm, wallMode: room.wallMode, sceneFace, sceneReveal, panels,
      programs: e.renderer.info.programs?.length ?? -1,
      census: room.panelCensus?.()?.instanced ?? null,
    };
  })()`);

  if (head.err) { fail('the engine and room are reachable', head.err); return; }
  note(`?coat=${head.arm} · walls=${head.wallMode} · ${head.panels.length} panels · programs ${head.programs}`);
  if (head.wallMode !== 'instanced') {
    skip('the instanced pristine path is the one under test', `wallMode is "${head.wallMode}"`);
    return;
  }
  if (head.census) {
    note(`census: ${head.census.groups} geometry groups · ${head.census.faceGroups} face groups · `
      + `${head.census.meshes} meshes for ${head.census.slots} slots · coatArm ${head.census.coatArm}`);
    for (const c of head.census.coats ?? []) {
      note(`   face ×${String(c.members).padStart(2)}  ${c.type.padEnd(21)} ${(c.material || '(none)').slice(0, 78)}`);
    }
  }

  // ---------------------------------------------------------------- K1
  const myPairs = [...new Set(head.panels.map((p) => p.geo + p.coat))].sort();
  const theirPairs = [...new Set(head.sceneFace.map((g) => g.full))].sort();
  const myGeo = [...new Set(head.panels.map((p) => p.geo))].sort();
  note(`--- instance meshes in the built scene: ${theirPairs.length} face + ${head.sceneReveal} reveal `
    + `(${myGeo.length} geometry groups) ---`);
  for (const g of head.sceneFace) note(`   ×${String(g.count).padStart(2)}  ${g.full.slice(0, 108)}`);

  const same = myPairs.length === theirPairs.length && myPairs.every((k, i) => k === theirPairs[i]);
  if (same) {
    pass('K1 CONTROL — the recomputed (geometry + coat) key reproduces `wallinstances.js`\'s own',
      `${myPairs.length} keys, character for character, off ${head.panels.length} panels. Every `
      + 'projection below is arithmetic on the grouping the build actually uses.');
  } else {
    fail('K1 CONTROL — the recomputed (geometry + coat) key reproduces `wallinstances.js`\'s own',
      `mine ${myPairs.length} vs the scene's ${theirPairs.length}. `
      + `only-mine: ${myPairs.filter((k) => !theirPairs.includes(k)).slice(0, 3).join(' | ').slice(0, 300)} · `
      + `only-theirs: ${theirPairs.filter((k) => !myPairs.includes(k)).slice(0, 3).join(' | ').slice(0, 300)}`);
  }

  // ---------------------------------------------------------------- K4
  const coatsFree = [...new Set(head.panels.filter((p) => p.free).map((p) => p.coatType + '|' + p.coatName))];
  note(`--- the coat on the free faces: ${coatsFree.length} distinct (class, bake) ---`);
  for (const c of coatsFree) {
    const rooms = [...new Set(head.panels.filter((p) => p.free && p.coatType + '|' + p.coatName === c).map((p) => p.room))];
    note(`   ×${head.panels.filter((p) => p.free && p.coatType + '|' + p.coatName === c).length}  ${c.slice(0, 96)}  [${rooms.join(',')}]`);
  }
  const armed = head.arm !== 0;
  // ⚠️ `?dig=bays` builds 92 panels and NOT ONE damage-armed free face, so there is nothing to
  // coat and nothing to split. A probe that cannot observe must SKIP, never PASS — and never FAIL
  // the build for the absence of its own subject, which is what the first build of this file did.
  const anyFree = head.panels.some((p) => p.free);
  if (!anyFree) {
    skip('the coat census flips with the arm', 'no damage-armed free face on this arm (`dig=bays`)');
  } else if (armed && coatsFree.length > 1) {
    pass(`K4 CONTROL — arm ${head.arm}: the free faces wear ${coatsFree.length} DIFFERENT coats`,
      'so the split has something to split on. Arm 0 reads exactly 1 through this same code.');
  } else if (!armed && coatsFree.length === 1) {
    pass('K4 CONTROL — arm 0: every free face wears ONE coat',
      'the shipped hardcoded boiserie, so K3 must read +0 and W1 must read damask.');
  } else {
    fail(`K4 CONTROL — the coat census flips with the arm (arm ${head.arm}, ${coatsFree.length} coats)`,
      armed ? 'the coat did not reach the faces on the armed arm'
        : 'something is coating faces on the DEFAULT arm');
  }

  // ---------------------------------------------------------------- K3 (static grouping delta)
  const byGeo = new Map();
  for (const p of head.panels) {
    if (!byGeo.has(p.geo)) byGeo.set(p.geo, new Set());
    byGeo.get(p.geo).add(p.coat);
  }
  const extraGroups = [...byGeo.values()].reduce((n, s) => n + s.size - 1, 0);
  note(`CONSTRUCTED: ${myGeo.length} geometry groups → ${myPairs.length} face meshes `
    + `(+${extraGroups}) + ${myGeo.length} reveals. Shape "split the whole group" would have been `
    + `+${extraGroups * 2} meshes; the reveal is deliberately NOT split.`);
  if (!armed) {
    if (extraGroups === 0) {
      pass('K3 CONTROL — arm 0 splits EXACTLY 0 groups',
        'every coat key is the empty string on the shipped arm, so the mesh set is character-for-'
        + 'character what it was. Run `--q "seed=s4&coat=1"`: a non-zero there is then a '
        + 'measurement, not a constant.');
    } else {
      fail('K3 CONTROL — arm 0 splits EXACTLY 0 groups',
        `+${extraGroups} extra face meshes on the DEFAULT arm — the shipped draw set moved`);
    }
  }

  // ---------------------------------------------------------------- the walk
  const rows = [];
  const seen = new Map();        // panel id -> {material, mesh, room, coatName}
  let decoyHits = 0, ambiguous = [];
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
    if (!ok) { note(`no anchor named ${name}`); continue; }
    await step(40);

    const r = await page.evaluate(`(() => {
      ${PAGE_HELPERS}
      const e = window.__rrr.engine;
      const room = e.room;
      const arm = Number(new URLSearchParams(location.search).get('coat') ?? 0) | 0;

      // ---- what the scene is actually drawing, and every instance transform in it ----
      const faceMeshes = [];
      let drawnFace = 0, drawnReveal = 0;
      e.scene.traverse((o) => {
        if (!o.isInstancedMesh || typeof o.name !== 'string') return;
        const isFace = o.name.startsWith('wall.pristine.face.');
        if (!isFace && !o.name.startsWith('wall.pristine.reveal.')) return;
        let par = o.parent, seen = true;
        while (par) { if (!par.visible) { seen = false; break; } par = par.parent; }
        const drawn = seen && o.visible;
        if (isFace) { if (drawn) drawnFace++; faceMeshes.push(o); }
        else if (drawn) drawnReveal++;
      });

      // 🚨 THE MATCH IS ON THE TRANSFORM THE GPU IS HANDED — not on my bookkeeping.
      const M = new (Object.getPrototypeOf(e.scene.matrixWorld).constructor)();
      const near = (a, b) => { for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-4) return false; return true; };
      const lookup = (want) => {
        const hits = [];
        for (const o of faceMeshes) {
          for (let s = 0; s < o.count; s++) {
            o.getMatrixAt(s, M);
            if (near(M.elements, want)) {
              hits.push({ mesh: o.name, material: o.material?.name ?? '', type: o.material?.type ?? '', visible: o.visible });
              break;
            }
          }
        }
        return hits;
      };

      const live = room.panels.filter((p) => p.pristine && p.wantVisible);
      const geoLive = new Set(live.map(geoKey));
      const pairLive = new Set(live.map((p) => geoKey(p) + coatKey(p, arm)));

      const found = [], amb = [];
      let decoy = 0;
      for (const p of live) {
        p.root.updateWorldMatrix(true, false);
        const want = p.root.matrixWorld.elements.slice();
        const hits = lookup(want);
        const uniq = [...new Set(hits.map((h) => h.material + '|' + h.type))];
        if (uniq.length > 1) amb.push({ id: p.id, hits: uniq });
        found.push({
          id: p.id, free: !!p.spec?.free,
          room: (p.ownerSpace?.root?.name ?? '').slice(6) || (p.spec?.a ?? '?'),
          coatName: p.mats?.[0]?.name ?? '', coatType: p.mats?.[0]?.type ?? '',
          hit: hits[0] ? hits[0].material : null, hitType: hits[0] ? hits[0].type : null,
          n: hits.length,
        });
        // W2 — the same search against a transform NO panel has
        const bogus = want.slice(); bogus[13] += 1.234;
        if (lookup(bogus).length) decoy++;
      }

      return {
        calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
        spaces: room.visibleSpaces(),
        livePanels: live.length, liveFree: live.filter((p) => p.spec?.free).length,
        geoLive: geoLive.size, pairLive: pairLive.size,
        drawnFace, drawnReveal, found, amb, decoy,
      };
    })()`);

    rows.push({ name, ...r });
    decoyHits += r.decoy;
    ambiguous = ambiguous.concat(r.amb.map((a) => `${name}:${a.id}`));
    for (const f of r.found) if (f.free) seen.set(f.id, f);
    note(`${name.padEnd(16)} calls ${String(r.calls).padStart(4)} · live pristine ${String(r.livePanels).padStart(2)}`
      + ` (${String(r.liveFree).padStart(2)} free) · face meshes drawn ${r.drawnFace}`
      + ` · geometry groups live ${r.geoLive} → +${r.pairLive - r.geoLive} for the coat`);
  }

  if (!rows.length) { fail('a station census was taken', 'no station could be parked'); return; }

  // ---------------------------------------------------------------- K2
  const bad = rows.filter((r) => r.drawnFace !== r.pairLive || r.drawnReveal !== r.geoLive);
  if (bad.length) {
    fail('K2 CONTROL — the predicted live group count IS what the scene draws',
      bad.map((r) => `${r.name}: predicted ${r.pairLive} face / ${r.geoLive} reveal, drew ${r.drawnFace} / ${r.drawnReveal}`).join(' · '));
  } else {
    pass('K2 CONTROL — the predicted live group count IS what the scene draws',
      `${rows.length} stations; face meshes drawn = distinct (geometry, coat) pairs live `
      + `(${rows.map((r) => r.drawnFace).join('/')}) and reveals = geometry groups live `
      + `(${rows.map((r) => r.drawnReveal).join('/')}) at every one.`);
  }

  // ---------------------------------------------------------------- W2
  if (decoyHits === 0) {
    pass('W2 CONTROL — the matcher can say NO',
      `every live pristine face's world matrix displaced 1.234 m in Y matched ZERO instance slots, `
      + `over ${rows.reduce((n, r) => n + r.livePanels, 0)} lookups. So a W1 "resolved" is a real `
      + 'match and not a search that returns whatever it finds first.');
  } else {
    fail('W2 CONTROL — the matcher can say NO',
      `${decoyHits} decoy lookups MATCHED. W1's results are unfalsifiable — do not use them.`);
  }

  // ---------------------------------------------------------------- W3
  if (ambiguous.length) {
    fail('W3 CONTROL — every live pristine face matches exactly one material',
      `${ambiguous.length} ambiguous: ${ambiguous.slice(0, 6).join(', ')}. Two faces share a world `
      + 'transform, so W1 cannot say which mesh draws which.');
  } else {
    pass('W3 CONTROL — every live pristine face matches exactly one material',
      'no two instance slots carry the same transform with different materials.');
  }

  // ---------------------------------------------------------------- W1
  const facesSeen = [...seen.values()];
  const unresolved = facesSeen.filter((f) => !f.hit);
  const matched = facesSeen.filter((f) => f.hit === f.coatName && f.hitType === f.coatType);
  const damask = facesSeen.filter((f) => f.hit === 'wall.pristine.face');
  note(`--- W1: what draws each free face, by MATRIX MATCH (${facesSeen.length} of `
    + `${head.panels.filter((p) => p.free).length} free faces reached over the walk) ---`);
  const byRoom = new Map();
  for (const f of facesSeen) {
    if (!byRoom.has(f.room)) byRoom.set(f.room, { n: 0, ok: 0, dam: 0 });
    const b = byRoom.get(f.room); b.n++;
    if (f.hit === f.coatName && f.hitType === f.coatType) b.ok++;
    if (f.hit === 'wall.pristine.face') b.dam++;
  }
  for (const [rm, b] of byRoom) note(`   ${rm.padEnd(10)} own coat ${b.ok}/${b.n} · damask ${b.dam}/${b.n}`);

  if (!anyFree) {
    skip('W1 — an untouched dig face draws its own room\'s coat',
      'no damage-armed free face on this arm (`dig=bays`) — there is nothing to coat');
  } else if (!facesSeen.length) {
    fail('W1 — an untouched dig face draws its own room\'s coat', 'no free face was reached on the walk');
  } else if (unresolved.length) {
    fail('W1 — an untouched dig face draws its own room\'s coat',
      `${unresolved.length} of ${facesSeen.length} live pristine faces matched NO instance slot `
      + `(${unresolved.slice(0, 5).map((f) => f.id).join(', ')}). W2 says the matcher can say no, so `
      + 'these faces are drawn by something this probe cannot see — or by nothing at all.');
  } else if (armed && matched.length === facesSeen.length) {
    pass(`W1 — arm ${head.arm}: an untouched dig face draws its OWN ROOM'S COAT, ${matched.length}/${facesSeen.length}`,
      `${byRoom.size} rooms, every face matched by world transform to an \`InstancedMesh\` whose `
      + 'material name IS that face\'s own bake key. On arm 0 the same code reads '
      + `${damask.length ? '' : '0/'}damask for all of them, so this is not a constant.`);
  } else if (armed) {
    fail(`W1 — arm ${head.arm}: an untouched dig face draws its OWN ROOM'S COAT`,
      `${matched.length} of ${facesSeen.length} matched; ${damask.length} still draw the shared damask `
      + `(${facesSeen.filter((f) => f.hit !== f.coatName).slice(0, 5).map((f) => `${f.id}→${(f.hit ?? 'none').slice(0, 28)}`).join(', ')})`);
  } else if (damask.length === facesSeen.length) {
    pass(`W1 — arm 0: an untouched dig face still draws the SHARED DAMASK, ${damask.length}/${facesSeen.length}`,
      'which is the shipped build unchanged, and it is also `wall.js`\'s own long-standing defect '
      + '("a band of damask in a boiserie room gave away the dig band before a blow landed"). '
      + 'Arm 1 must read the room\'s coat for every one of these same faces.');
  } else {
    fail('W1 — arm 0: an untouched dig face still draws the SHARED DAMASK',
      `only ${damask.length} of ${facesSeen.length} draw \`wall.pristine.face\` — the coat has `
      + 'leaked onto the shipped arm');
  }

  /**
   * ---------------------------------------------------------------- K5: the key John presses
   * 🚨 **THE LIVE `[C]` PATH IS NOT THE PATH THE REST OF THIS FILE TESTS.** Everything above is a
   * page booted on `?coat=N`, where the grouping is decided at construction. In game the arm is
   * cycled by a key press, which re-coats 28 faces one at a time and leaves `wallinstances.js`
   * holding a grouping that is now wrong. The regroup is deferred to the next `sync()` — which
   * `room.setViewpoints` runs every frame — and NOTHING here forces it: this section presses the
   * real key on a live page and reads the census.
   * ⚠️ **Its control is the CYCLE.** Arm 0 → 1 → 2 → 0 must return the face-group count to where
   * it started, so a regroup that leaked meshes, or one that never ran, both show up.
   */
  {
    const faceGroups = () => page.evaluate(() => {
      const c = window.__rrr.engine.room.panelCensus?.()?.instanced;
      return { n: c?.faceGroups ?? -1, arm: c?.coatArm ?? -1, meshes: c?.meshes ?? -1 };
    });
    const pressC = async () => {
      await page.keyboard.down('KeyC'); await page.waitForTimeout(60);
      await page.keyboard.up('KeyC'); await step(6);
    };
    const seq = [await faceGroups()];
    for (let i = 0; i < 3; i++) { await pressC(); seq.push(await faceGroups()); }
    note(`--- K5: [C] pressed three times, live page, nothing forced a sync ---`);
    for (const s of seq) note(`   arm ${s.arm} · ${s.n} face groups · ${s.meshes} meshes`);
    const start = seq[0], back = seq[3];
    const moved = seq.slice(1, 3).filter((s) => s.n !== start.n).length;
    if (!anyFree) {
      skip('K5 — the live [C] key regroups the instanced faces',
        'no damage-armed free face on this arm (`dig=bays`) — the key has nothing to regroup');
    } else if (seq.some((s) => s.arm < 0)) {
      skip('K5 — the live [C] key regroups the instanced faces', 'census not reachable');
    } else if (start.arm !== 0) {
      skip('K5 — the live [C] key regroups the instanced faces', `the page did not start on arm 0 (${start.arm})`);
    } else if (moved === 2 && back.arm === 0 && back.n === start.n && back.meshes === start.meshes) {
      pass('K5 — the live [C] key regroups the instanced faces, and the cycle returns exactly',
        `arm 0 ${start.n} → arm 1 ${seq[1].n} → arm 2 ${seq[2].n} → arm 0 ${back.n} face groups, `
        + `${start.meshes} → ${back.meshes} meshes. No forced sync: the regroup rides `
        + '`room.setViewpoints`, which is what makes the key one press and one frame.');
    } else if (moved !== 2) {
      fail('K5 — the live [C] key regroups the instanced faces',
        `face groups stayed at ${start.n} on ${2 - moved} of the two armed presses — the key `
        + 're-coated the panels but the instanced faces kept their old grouping.');
    } else {
      fail('K5 — the cycle 0→1→2→0 returns exactly',
        `arm ${back.arm}, ${back.n} face groups / ${back.meshes} meshes against ${start.n} / `
        + `${start.meshes} at the start — the regroup is leaking or not reverting.`);
    }
  }

  // ---------------------------------------------------------------- the cost
  const worst = rows.reduce((a, b) => ((b.pairLive - b.geoLive) > (a.pairLive - a.geoLive) ? b : a));
  const worstCalls = rows.reduce((a, b) => (b.calls > a.calls ? b : a));
  note(`WORST EXTRA FACE GROUPS: ${worst.name} — ${worst.geoLive} → ${worst.pairLive} `
    + `(+${worst.pairLive - worst.geoLive} draw calls)`);
  note(`WORST STATION BY CALLS: ${worstCalls.name} — ${worstCalls.calls}/625 calls, `
    + `${worstCalls.tris}/900k tris ⚠️ REPORTED — a walked reading, see `
    + '`dressbin-1` (423/461/479 on one build). The per-station delta above is the exact number.');
}
