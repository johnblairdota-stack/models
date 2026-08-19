import * as THREE from 'three';

/**
 * ⚠️ ESTATE SPIKE — `?estate=` — A MEASURING INSTRUMENT, NOT A FEATURE. DEFAULT OFF.
 *
 * John, 2026-08-08, after playing: *"this is still the same asset map for the original
 * playable slice. none of the room assets are in the playable slice… I just want the game to
 * progress from the assets we made for the 3 rooms we had in the art."*
 *
 * He is right and it is verified: `views/game.js` never imports `room-gallery.js`,
 * `room-ballroom.js` or `room-study.js`. Those are standalone `view()` modules that build
 * their own studio scene to be photographed; the game builds its own rooms out of axis-aligned
 * boxes in `room.js` `buildSpace()`. So every art score on the board is for a frame no player
 * ever sees.
 *
 * THIS FILE EXISTS TO PRICE THE FIX BEFORE ANYONE COMMITS TO IT. It ports the SHOWCASE
 * `room.gallery` into the GAME's `gallery` space, in three separable layers, so each can be
 * measured on its own at the parked stations:
 *
 *   ?estate=geo      the architecture — clerestory window order, string course, pilasters,
 *                    coffered ceiling, portraits, urns, console — in the GAME's materials.
 *                    Isolates the GEOMETRY cost from everything else.
 *   ?estate=mat      `geo`, plus the showcase's own local material set (neutral damask, pale
 *                    gilt, parquet, the 2048 portrait atlas, the clerestory glazing). Isolates
 *                    the BAKE / VRAM / program cost.
 *   ?estate=lights   the practical rig alone: 12 picture lights, 10 sconces, a candelabra,
 *                    the clerestory bounce, the cold key. +17 point, +13 spot, +3 directional.
 *   ?estate=all      all three.
 *   ?estate=pN       N dim point lights at gallery height and nothing else — the per-light
 *                    COST CURVE, with no geometry and no materials confounding it.
 *   ?estate=sN       the same for N spot lights, because a spot is not a point.
 *
 * Comma-separable: `?estate=geo,lights`.
 *
 * ⚠️ **THE SPIKE IS ADDITIVE — IT DOES NOT DELETE THE GAME'S OWN BOXES.** So the `geo` arm is
 * an UPPER BOUND on the real refactor's geometry delta: in the refactor the game's wall boxes
 * are replaced by the kit's wall runs, and both land in the same merged `GeoBin` buckets.
 * Stated here so nobody quotes the number as if it were the net cost.
 *
 * ⚠️ **AND IT DOES NOT TOUCH `room-gallery.js`.** Every parameter below is COPIED from that
 * file, not imported out of it, precisely because the brief forbids regressing the showcase's
 * own render. When this becomes a real refactor those parameters move into a shared builder
 * that both consume — see the finding for the shape of that.
 *
 * ⚠️ **`numPointLights` IS PART OF THREE'S PROGRAM CACHE KEY AND IT IS GLOBAL TO THE SCENE.**
 * `views/game.js`'s warm-up lap records the measured price of learning that (John's five-second
 * freeze). The `lights` arm therefore changes the count for the WHOLE HOUSE, not for the
 * gallery — an invisible light is culled out of the count, and culling it is itself a full
 * recompile. Residency saves draw calls; it saves nothing at all on light count. That is the
 * single most important thing this instrument is here to put a number on.
 */

// The GAME's gallery space (`spaces.js`): x -13.60..13.60, z -31.00..-24.30, storey 5.60.
// The SHOWCASE gallery (`views/room-gallery.js`): 7.2 wide, 6.4 high, z -20..+7 = 27.0 long.
// Same room to within half a metre in width and 0.8 m in height — and the long axis is 27 m in
// both. The axes are SWAPPED (the showcase runs down Z, the game runs down X), which one rotY
// on the group handles; nothing else in the port cares.
const GAME = { x0: -13.60, x1: 13.60, z0: -31.00, z1: -24.30, storey: 5.60 };
const LEN = GAME.x1 - GAME.x0;          // 27.20
const WID = GAME.z1 - GAME.z0;          //  6.70
const H = GAME.storey;                  //  5.60

// Showcase local frame: length along z in [-LEN/2, +LEN/2], width along x in [-WID/2, +WID/2].
// rotY = +PI/2 maps local (x, z) -> world (z, -x); the offset then lands the centre on the
// game gallery's own centre.
const CENTRE = new THREE.Vector3((GAME.x0 + GAME.x1) / 2, 0, (GAME.z0 + GAME.z1) / 2);

/**
 * The clerestory, rescaled from the showcase's 6.4 m storey to the game's 5.60.
 * The showcase runs sill 4.00 / spring 4.72 / head 5.53 under a 6.4 m ceiling and stops its
 * panelled field at 3.95. Everything here is that set times 5.60/6.40, which keeps the two
 * storeys' PROPORTION — the reason the band reads as a second storey rather than as holes.
 * ⚠️ The head must stay clear of the game's 2.72 m doorways, and at 4.84 it is, by 2.1 m —
 * which is why the spike can be purely additive without re-cutting a single wall.
 */
const K = 5.60 / 6.40;
const FIELD_TOP = 3.95 * K;                     // 3.456
const CL = {
  w: 1.62, sill: 4.00 * K, spring: 4.72 * K, head: 5.53 * K, pitch: 3.7, n: 7, z0: LEN / 2 - 2.0,
};

export function estateMode(raw) {
  if (raw == null || raw === '' || raw === '0' || raw === 'off') return null;
  const m = { geo: false, mat: false, lights: false, points: 0, spots: 0, raw: String(raw) };
  let any = false;
  for (const part of String(raw).split(/[,+]/).map((s) => s.trim()).filter(Boolean)) {
    /**
     * 🆕 **`port` IS THE REFACTOR AND EVERY ARM ABOVE IT IS THE PRICE PROBE.** The arms below
     * are `estate-spike-1`'s instrument: additive, measured, and deliberately NOT a build. `port`
     * is `estate-1`'s replacement — `src/game/room.js` builds the gallery's walls to the estate
     * kit's order instead of stacking one on the other, and `views/game.js` hangs the MERGED
     * fixture rig on it with a constant light count. It shares this query parameter because a
     * reader looking for "the estate work" should find one switch, not two.
     *
     *   ?estate=port          the refactor: architecture + the showcase's surfaces + the rig
     *   ?estate=port,norig    architecture and materials only, no practicals — the ablation
     *   ?estate=port,lp0      the refactor with ZERO added point lights, to price the two
     *   ?estate=port,lp6      ...or six, same reason
     *
     * ⚠️ **DEFAULT OFF**, like everything else on this parameter, until the numbers are good.
     */
    /**
     * 🆕 **`study` RIDES ON `port` AND IS ON BY DEFAULT; `nostudy` IS THE ABLATION.**
     *
     * `estate-2`, 2026-08-09. The SECOND of John's three rooms — `src/world/study-order.js`,
     * shared by `views/room-study.js` and the playable `study_w` / `study_e`. It is inside
     * `port` rather than beside it because John's instruction is that the game should progress
     * from the art (*"...that way its set up to reach for the art bar instead of progressing in
     * the original slice rooms"*), and a room behind a flag nobody types is a room he never
     * sees — that is the exact failure `dig` spent seven builder rounds inside.
     *
     * ⚠️ **BUT IT IS ONE WORD TO TURN OFF, AND THAT IS NOT DECORATION.** `study_w` is the
     * PLAYER'S SPAWN ROOM and `escape`, `dig-free` and `mechanics` all run through it, so the
     * arm that proves "the port did this" has to exist before the port ships, not after
     * something goes wrong. `?estate=port,nostudy` is the shipped gallery-only build.
     *
     *   ?estate=port,nostudy   gallery order only — the 2026-08-08 default, for A/B
     *   ?estate=port,sp0       the studies with ZERO added point lights, to price the two
     *   ?estate=port,sp4       ...or four, same reason
     */
    /**
     * 🆕 **`ballroom` RIDES ON `port` AND IS ON BY DEFAULT; `noballroom` IS THE ABLATION.**
     *
     * `estate-3`, 2026-08-09. The THIRD and last of John's three rooms —
     * `src/world/ballroom-order.js`, shared by `views/room-ballroom.js` and the playable
     * `ballroom`. Inside `port` for the same reason the study is: a room behind a flag nobody
     * types is a room John never sees.
     *
     * 🚨 **BUT THE STOREY RAISE IS *NOT* ON THIS FLAG, AND THAT IS DELIBERATE.**
     * `spaces.js` now says `ballroom.storey: 9.60` unconditionally. The ablation is the ORDER,
     * not the floor plan — an arm that also rebuilt the room at 7.20 would differ in geometry,
     * fill, residency AND lighting all at once, and every number taken on it would be
     * attributable to none of them. `estate-2`'s item 7 is the whole reason that rule exists:
     * *"a toggle that reverts less than it claims contaminates every comparison made with it"*,
     * and the mirror image — a toggle that reverts MORE than it claims — is the same defect.
     *
     *   ?estate=port,noballroom  gallery + studies only, in a 9.6 m ballroom box — the A/B arm
     *   ?estate=port,bp0         the ballroom with ZERO added point lights (which is the
     *                            DEFAULT, see `ballroom-rig.js`) — kept so `bp` is symmetric
     *   ?estate=port,bp2         ...or two, to re-price the choice rather than argue it
     */
    if (part === 'port') { m.port = true; any = true; }
    else if (part === 'study') { m.study = true; any = true; }
    else if (part === 'nostudy') { m.nostudy = true; any = true; }
    else if (part === 'ballroom') { m.ballroom = true; any = true; }
    else if (part === 'noballroom') { m.noballroom = true; any = true; }
    else if (/^bp\d+$/.test(part)) { m.ballPoints = +part.slice(2); any = true; }
    else if (/^sp\d+$/.test(part)) { m.studyPoints = +part.slice(2); any = true; }
    else if (part === 'norig') { m.norig = true; any = true; }
    else if (/^lp\d+$/.test(part)) { m.rigPoints = +part.slice(2); any = true; }
    else if (part === 'all' || part === '1' || part === 'gallery') { m.geo = m.mat = m.lights = true; any = true; }
    else if (part === 'geo') { m.geo = true; any = true; }
    else if (part === 'mat') { m.geo = true; m.mat = true; any = true; }
    else if (part === 'lights') { m.lights = true; any = true; }
    // ⚠️ THE SHOWCASE'S COLD KEY IS A SECOND SHADOW CASTER AND THE GAME HAS EXACTLY ONE.
    // A shadow map is a whole extra pass over every casting mesh in the house — a draw-call
    // cost that has nothing to do with the 30 practicals and would otherwise be attributed to
    // them. `nosun` drops it so the two halves can be told apart.
    else if (part === 'nosun') { m.lights = true; m.nosun = true; any = true; }
    /**
     * ⚠️ **`resident` PARENTS THE SPIKE UNDER THE GALLERY'S SPACE ROOT SO PORTAL RESIDENCY
     * GOVERNS IT — AND IT IS THE MOST IMPORTANT ARM IN THIS FILE.**
     *
     * Without it the spike hangs off `scene` and is drawn from every room in the house, which
     * OVERSTATES the refactor. With it the meshes are hidden when the gallery is not resident,
     * which is what the refactor would actually do — **and the LIGHTS are hidden with them.**
     * three's `projectObject` skips invisible subtrees entirely, so a hidden practical is culled
     * out of `numPointLights`, `numPointLights` is part of the program cache key, and the count
     * therefore changes every time the player walks in or out of the room. That is the exact
     * mechanism behind John's five-second freeze (`views/game.js`'s warm-up lap). So the two
     * arms are not "with and without an optimisation" — they are the two horns of a dilemma,
     * and the number that decides which one hurts less is the point of measuring both.
     */
    else if (part === 'resident') { m.resident = true; any = true; }
    else if (/^p\d+$/.test(part)) { m.points = +part.slice(1); any = true; }
    else if (/^s\d+$/.test(part)) { m.spots = +part.slice(1); any = true; }
  }
  // ⚠️ RESOLVED HERE AND NOWHERE ELSE. `room.js` and `views/game.js` both read this flag — the
  // first builds the order, the second hangs the practicals on it — and if they disagreed the
  // room would be built to the estate order with its fixture rig left off. HANDOFF's rule about
  // toggles that revert less than they claim, applied to a toggle that has two call sites.
  if (m.port && m.study !== true) m.study = !m.nostudy;
  if (m.port && m.ballroom !== true) m.ballroom = !m.noballroom;
  return any ? m : null;
}

/**
 * @returns a REPORT, so `--probe` can assert the arm actually took effect rather than trust
 *          the query string it passed. HANDOFF's rule; two toggles in this project have
 *          reverted less than they claimed and contaminated every comparison made with them.
 */
export async function applyEstateSpike(engine, room, mode, gameMats = null) {
  const report = {
    mode: mode.raw, geo: false, mat: false, lights: false,
    meshes: 0, tris: 0, pointsAdded: 0, spotsAdded: 0, dirsAdded: 0, bakeMs: 0, keys: [],
  };
  const group = new THREE.Group();
  group.name = 'estate.spike.gallery';
  group.rotation.y = Math.PI / 2;
  const host = mode.resident ? (room?.spaces?.find?.((s) => s.id === 'gallery')?.root ?? null) : null;
  if (host) {
    // the space root sits at world origin, so the group's own transform is unchanged
    group.position.copy(CENTRE);
    host.add(group);
    report.parent = 'space.gallery';
  } else {
    group.position.copy(CENTRE);
    engine.scene.add(group);
    report.parent = 'scene';
  }

  // ---- the per-light COST CURVE arms: no geometry, no materials, nothing to confound it.
  for (let i = 0; i < mode.points; i++) {
    const l = new THREE.PointLight(0xffeee0, 1.4, 5.0, 2);
    l.position.set((i % 2 ? 1 : -1) * (WID / 2 - 0.3), 3.3, -LEN / 2 + 1.5 + (i >> 1) * 2.4);
    group.add(l); report.pointsAdded++;
  }
  for (let i = 0; i < mode.spots; i++) {
    const s = new THREE.SpotLight(0xfff2e6, 3.05, 3.2, 0.9, 0.6, 2);
    s.position.set((i % 2 ? 1 : -1) * (WID / 2 - 0.25), 3.5, -LEN / 2 + 1.5 + (i >> 1) * 2.4);
    s.target.position.set(s.position.x * 1.2, 2.4, s.position.z);
    group.add(s, s.target); report.spotsAdded++;
  }

  // ---- GEOMETRY (and, with `mat`, the showcase's own surfaces on it) -----------------
  if (mode.geo) {
    const kit = await tryImport(() => import('../world/kit.js'));
    const props = await tryImport(() => import('../world/props.js'));
    if (!kit?.GeoBin) { report.error = 'kit unavailable'; return finish(); }

    const t0 = performance.now();
    const M = mode.mat ? await showcaseMaterials() : gameLike(gameMats);
    report.bakeMs = Math.round(performance.now() - t0);
    report.mat = !!mode.mat;

    const bin = new kit.GeoBin();
    const clZ = [];
    for (let i = 0; i < CL.n; i++) clZ.push(CL.z0 - i * CL.pitch);

    // The clerestory order itself — fourteen lights, seven a side. This is the piece's own
    // second architectural rhythm (3.7 m against the pilasters' 3.02), and in the showcase it
    // is what carries the top of the luminance range.
    for (const z of clZ) {
      for (const [wx, wry] of [[-WID / 2 + 0.005, Math.PI / 2], [WID / 2 - 0.005, -Math.PI / 2]]) {
        kit.windowBay(bin, {
          x: wx, y: 0, z, rotY: wry,
          w: CL.w, h: CL.head - CL.sill, sill: CL.sill, spring: CL.spring, spandrelSteps: 6,
          keys: { reveal: 'wintrim', trim: 'wintrim', stone: 'wintrim', glass: 'clere', lead: 'wood' },
          mullions: 1, transoms: 2,
        });
      }
    }
    // the string course the clerestory stands on — what makes the two rhythms read as two
    // STOREYS rather than as one wall with holes in it
    const dadoBand = kit.dadoProfile(0.30, 0.13);
    for (const [sx, sry] of [[-WID / 2 + 0.02, Math.PI / 2], [WID / 2 - 0.02, -Math.PI / 2]]) {
      const m = new THREE.Matrix4().makeTranslation(sx, FIELD_TOP, sry > 0 ? LEN / 2 : -LEN / 2)
        .multiply(new THREE.Matrix4().makeRotationY(sry));
      bin.add('stone', kit.extrudeProfile(dadoBand, LEN, { x0: 0 }), m);
    }
    // fluted pilasters at the bay rhythm, both long walls
    for (let i = 0; i <= 9; i++) {
      const z = LEN / 2 - (i * LEN) / 9;
      for (const [px, pry] of [[-WID / 2 + 0.13, Math.PI / 2], [WID / 2 - 0.13, -Math.PI / 2]]) {
        kit.pilaster(bin, {
          x: px, y: 0.34, z, rotY: pry, h: FIELD_TOP - 0.40, w: 0.50, proj: 0.13, flutes: 5,
          keys: { shaft: 'wall', cap: 'gilt' },
        });
      }
    }
    // the transverse arch — the one large-scale event that divides 27 m into two unequal rooms
    {
      const cz = -8.6;
      for (const s of [-1, 1]) {
        kit.pilaster(bin, {
          x: s * (WID / 2 - 0.26), y: 0.34, z: cz, rotY: s > 0 ? -Math.PI / 2 : Math.PI / 2,
          h: FIELD_TOP + 0.55, w: 0.78, proj: 0.30, flutes: 3, keys: { shaft: 'stone', cap: 'gilt' },
        });
      }
      bin.box('stone', WID, 0.62, 0.44, 0, H - 1.30, cz, 1.0);
      for (const s of [-1, 1]) bin.box('stone', 0.70, H - 1.62, 0.44, s * (WID / 2 - 0.36), (H - 1.62) / 2, cz, 1.0);
      bin.add('gilt', kit.extrudeProfile(kit.corniceProfile(0.34, 0.20), WID, { x0: -WID / 2 }),
        new THREE.Matrix4().makeTranslation(0, H - 1.60, cz + 0.24));
    }
    // the coffered ceiling — the whole top third of the frame in the showcase
    kit.cofferedCeiling(bin, {
      w: WID - 0.9, d: LEN - 1.0, cellsX: 2, cellsZ: 9, y: H - 0.02, beam: 0.26, drop: 0.28, z: 0,
      keys: { pan: 'ceil', beam: 'wood', boss: 'gilt' },
    });

    // the portraits — ONE merged mesh uv-mapped into an eight-cell atlas, so twelve sitters
    // cost a single draw call. This is the motif the room is named for.
    const items = [];
    for (let i = 0; i < 6; i++) {
      const z = LEN / 2 - 2.6 - i * 2.9;
      const big = i % 3 === 1;
      items.push({ x: z, y: big ? 2.60 : 2.40, w: big ? 1.60 : 1.18, h: big ? 2.10 : 1.58, cell: i });
    }
    if (props?.portraitWall) {
      const lp = props.portraitWall(bin, {
        x: -WID / 2 + 0.11, y: 0, z: 0, rotY: Math.PI / 2, material: M.portrait,
        items, keys: { frame: 'gilt' },
      });
      if (lp) group.add(lp);
      const rp = props.portraitWall(bin, {
        x: WID / 2 - 0.11, y: 0, z: 0, rotY: -Math.PI / 2, material: M.portrait,
        items: items.map((it, i) => ({ ...it, x: it.x + 1.45, cell: (i + 3) % 8 })),
        keys: { frame: 'gilt' },
      });
      if (rp) group.add(rp);
    }
    // dressing — urns and a console table, the "compositional emptiness" answer
    if (props?.urnOnPedestal) {
      for (const z of [-2.0, -7.6]) {
        props.urnOnPedestal(bin, { x: -WID / 2 + 0.62, y: 0, z, h: 1.25, keys: { stone: 'stone', gilt: 'gilt' } });
        props.urnOnPedestal(bin, { x: WID / 2 - 0.62, y: 0, z: z - 2.8, h: 1.25, keys: { stone: 'stone', gilt: 'gilt' } });
      }
    }
    if (props?.consoleTable) {
      props.consoleTable(bin, { x: WID / 2 - 0.42, y: 0, z: 2.0, rotY: -Math.PI / 2, keys: { wood: 'wood', gilt: 'gilt', marble: 'marbleTop' } });
    }
    report.keys = [...bin.bins.keys()];
    for (const m of bin.build(M, { noCast: ['glass', 'clere', 'ceil', 'wintrim'] })) {
      m.name = `estate:${m.name.replace(/^kit:/, '')}`;
      group.add(m);
      report.meshes++;
      report.tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    }
    report.geo = true;
  }

  // ---- THE PRACTICALS. Priced separately because `legibility-1` showed the game's murk is a
  // LIGHTING difference, not a grading one: the game runs a hardcoded five-light rig and the
  // showcase runs a full practical set.
  if (mode.lights) {
    const prac = await tryImport(() => import('../lighting/practicals.js'));
    const vol = await tryImport(() => import('../lighting/volumetric.js'));
    const rig = await tryImport(() => import('../lighting/rig.js'));
    const mats = await showcaseMaterials();
    const clZ = [];
    for (let i = 0; i < CL.n; i++) clZ.push(CL.z0 - i * CL.pitch);

    // one picture light per painting — 12 SpotLights, the showcase's own numbers
    const items = [];
    for (let i = 0; i < 6; i++) {
      const z = LEN / 2 - 2.6 - i * 2.9;
      const big = i % 3 === 1;
      items.push({ x: z, y: big ? 2.60 : 2.40, w: big ? 1.60 : 1.18, h: big ? 2.10 : 1.58 });
    }
    if (prac?.pictureLight) {
      for (const it of items) {
        for (const [sx, sry, zz] of [[-WID / 2 + 0.24, Math.PI / 2, it.x], [WID / 2 - 0.24, -Math.PI / 2, it.x + 1.45]]) {
          const pl = prac.pictureLight({
            brass: mats.brass, w: it.w * 0.72, intensity: 3.05, distance: 3.2, angle: 0.9,
            color: 0xfff2e6,
          });
          pl.position.set(sx, it.y + it.h / 2 + 0.30, zz);
          pl.rotation.y = sry;
          group.add(pl); report.spotsAdded++;
          if (vol?.glowPatch) {
            const gl = vol.glowPatch({ size: it.w * 2.2, color: 0xfff2e4, strength: 0.22, pow: 1.9 });
            gl.position.set(sx - Math.sign(sx) * 0.10, it.y, zz);
            gl.rotation.y = sry;
            group.add(gl);
          }
        }
      }
    }
    // ten sconces down the run — 10 PointLights
    if (prac?.sconce) {
      for (let i = 0; i < 5; i++) {
        const z = LEN / 2 - 4.0 - i * 2.9;
        for (const [sx, sry] of [[-WID / 2 + 0.20, Math.PI / 2], [WID / 2 - 0.20, -Math.PI / 2]]) {
          const sc = prac.sconce({
            brass: mats.brass, intensity: 1.85, distance: 5.0, phase: z + sx,
            glowStrength: 0.26, glowSize: 3.0, glowColor: 0xfff0e2, lightColor: 0xffeee0,
          });
          sc.position.set(sx, 3.35, z);
          sc.rotation.y = sry;
          group.add(sc); report.pointsAdded++;
        }
      }
    }
    // the candelabra — 2 PointLights
    if (prac?.candelabra) {
      const cd = prac.candelabra({ brass: mats.brass, h: 1.5, arms: 6, intensity: 0.6, distance: 5.0, lights: 2, phase: 1.1, lightColor: 0xffeee0 });
      cd.position.set(-2.15, 0, -1.2);
      group.add(cd); report.pointsAdded += 2;
    }
    // the cool wash under the clerestory — 4 PointLights
    for (const z of [CL.z0 - CL.pitch, CL.z0 - CL.pitch * 3]) {
      for (const s of [-1, 1]) {
        const b = new THREE.PointLight(new THREE.Color(0xb6c8e4), 2.6, 7.0, 2);
        b.position.set(s * (WID / 2 - 0.55), CL.sill - 0.30, z);
        group.add(b); report.pointsAdded++;
      }
    }
    // and the sunpatch each clerestory throws — unlit paint, no light cost
    if (vol?.glowPatch) {
      for (const z of clZ) {
        for (const [sx, sry] of [[-WID / 2 + 0.14, Math.PI / 2], [WID / 2 - 0.14, -Math.PI / 2]]) {
          const g = vol.glowPatch({ size: 3.6, color: 0xc6d8f2, strength: 0.78, pow: 1.6 });
          g.position.set(-sx, 2.45, z - Math.sign(sx) * 0.9);
          g.rotation.y = -sry;
          group.add(g);
        }
        const cg = vol.glowPatch({ size: 5.0, color: 0xbecfe8, strength: 0.30, pow: 1.5 });
        cg.rotation.x = Math.PI / 2;
        cg.position.set(0, H - 0.42, z);
        group.add(cg);
      }
    }
    // the cold source at the far end — one shadow-casting SpotLight, plus its bounce
    if (rig?.spotKey && !mode.nosun) {
      const sun = rig.spotKey({
        color: 0xdce8ff, intensity: 1150,
        position: [0.6, H + 2.6, -LEN / 2 - 3.0], target: [0, 0, -LEN / 2 + 2.4],
        angle: 0.30, penumbra: 0.35, decay: 1.0, distance: 60,
        mapSize: 1024, near: 2, far: 60, normalBias: 0.03, bias: -0.0009,
      });
      group.add(sun, sun.target); report.spotsAdded++;
    }
    const coldBounce = new THREE.PointLight(new THREE.Color(0xa9c2ea), 10.0, 13.0, 2);
    coldBounce.position.set(0, 1.0, -LEN / 2 + 2.6);
    group.add(coldBounce); report.pointsAdded++;
    // the bounce pair — 3 unshadowed directionals, the thing that stops an unlit side
    // collapsing into a flat cut-out
    if (rig?.bounceFill) {
      group.add(rig.bounceFill({
        warm: 0.24, warmColor: 0xffdcc0, warmDir: [3, 2, 8],
        cold: 0.50, coldColor: 0xa6bbe0, coldDir: [-1, 6, -3],
        up: 0.12, upColor: 0x9a8478,
      }));
      report.dirsAdded += 3;
    }
    // haze down the run — the single biggest depth cue in a 27 m corridor, and free
    if (vol?.glowPatch) {
      for (const z of [-3, -9, -15]) {
        const h = vol.glowPatch({ size: 11, color: 0x9fb0cc, strength: 0.055, pow: 1.3 });
        h.position.set(0, 2.6, z);
        group.add(h);
      }
    }
    if (prac?.driveFlicker) prac.driveFlicker(engine);
    if (vol?.driveVolumetrics) vol.driveVolumetrics(engine, group);
    report.lights = true;
  }

  return finish();

  function finish() {
    let point = 0, spot = 0, dir = 0;
    engine.scene.traverse((o) => {
      if (o.isPointLight) point++; else if (o.isSpotLight) spot++; else if (o.isDirectionalLight) dir++;
    });
    report.sceneLights = { point, spot, dir };
    report.group = group.name;
    engine.__estateSpike = report;
    return report;
  }
}

/**
 * The showcase's own material set. ⚠️ `estateMaterials()` is LAZY — every entry is a getter
 * that bakes on first access — so the recorded "222 -> 270 MB, 18-24 s" whole-set figure is
 * what a SHOWCASE view costs, not what this costs. Touching six keys bakes six.
 */
async function showcaseMaterials() {
  const L = await tryImport(() => import('../world/materials-local.js'));
  if (!L?.estateMaterials) return gameLike(null);
  const mats = await L.estateMaterials();
  return {
    // the showcase's LOCAL corrections, copied rather than imported — `room-gallery.js` must
    // not be edited, and these three are most of that view's chroma result
    wall: mats.wallpaperNeutral ?? mats.wallpaper,
    gilt: L.giltMat({
      gold: [0.775, 0.712, 0.575], bole: [0.310, 0.245, 0.200],
      gesso: [0.790, 0.775, 0.750], wear: 0.72, seed: 6.0,
    }),
    clere: L.stainedGlassMat({
      pale: [0.900, 0.935, 0.990], gold: [0.500, 0.545, 0.610],
      blue: [0.400, 0.460, 0.560], ruby: [0.460, 0.490, 0.540],
      medallion: 0, seed: 21.0, emissive: 6.0, aspect: 1.15, ink: 0.45,
    }),
    ceil: L.ceilingMat({ tint: [0.402, 0.390, 0.378], stain: 0.8 }),
    stone: mats.stone, wintrim: mats.stone, wood: mats.walnutBoard,
    marbleTop: mats.marbleSlab, portrait: mats.portrait, brass: mats.brass,
    glass: mats.clearGlass,
  };
}

/** The GAME's five materials, keyed the way the kit expects — the `geo` arm's control. */
function gameLike(m) {
  const plain = (c, r, mtl = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mtl });
  const wall = m?.wall ?? plain(0x51443a, 0.72);
  const mould = m?.mould ?? plain(0x6a5628, 0.45, 0.7);
  return {
    wall, gilt: mould, wood: mould, stone: m?.skirt ?? plain(0x201b16, 0.85),
    wintrim: m?.skirt ?? plain(0x201b16, 0.85), ceil: m?.ceiling ?? plain(0x554d42, 0.9),
    clere: plain(0x9fb0cc, 0.4), glass: plain(0x9fb0cc, 0.4),
    marbleTop: m?.floor ?? plain(0x3a2a1c, 0.62), portrait: wall, brass: mould,
  };
}

async function tryImport(fn) { try { return await fn(); } catch (e) { console.warn('[estate-spike]', e?.message ?? e); return null; } }
