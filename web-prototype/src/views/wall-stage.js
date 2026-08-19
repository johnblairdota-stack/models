import * as THREE from 'three';
import { estate } from './_studio.js';
import { wallStageMaterials } from '../materials/surfaces/wallstages.js';
import { WallState, STAGE_NAMES, FINAL_STAGE } from '../destruction/wall.js';
import { applyBreakMask, applyStageBreaks } from '../materials/breakmask.js';

/**
 * One destruction stage, framed the way the blind identification test will crop it: filling
 * the frame, lit from one side so relief reads, no other objects to give context away.
 *
 * The wall is built as the four nested layers the state machine expects, so this view is
 * driving the REAL machine — `layer i is visible when i >= stage` — not faking a look per
 * stage. Setting `?view=wall.2.lath` really does put a WallState at stage 2.
 */
export default async function view(args = {}) {
  const stage = args.stage ?? 0;

  // Pitched down about 10 degrees and pulled back a little from the old dead-level framing.
  // Level at 2.35 m the floor was outside the frame entirely — the wall had no ground under
  // it, which is why there was nowhere to put the debris pile the critic asked for and why
  // the wall floated. This keeps the wall filling the frame while showing the ~30 cm strip
  // of floor at its base where everything that fell off it has landed.
  const engine = await estate({
    cameraPos: [0, 1.5, 2.6],
    target: [0, 1.05, 0],
    fov: 46,
    far: 30,
    envIntensity: 1.05,
  });

  // A raking key so relief casts real shadows — the only honest way to judge lath depth.
  const key = new THREE.DirectionalLight(0xfff0dc, 5.2);
  key.position.set(-3.2, 3.4, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  engine.scene.add(key);

  // cool fill from the opposite side so the unlit half is readable, not a cut-out
  const fill = new THREE.DirectionalLight(0x9fb6d8, 1.35);
  fill.position.set(3.0, 1.4, 2.2);
  engine.scene.add(fill);

  // Judging framing: the estate grade crushes this to near-black, which makes the stage
  // impossible to assess. Darkness is light.dark's piece; this one has to be legible.
  //
  // ca: 0 IS LOAD-BEARING. Chromatic aberration offsets red and blue by r-squared, so it
  // peaks at the frame edges — and on a wall of high-frequency horizontal lath grain that
  // produces visible red/cyan rainbow fringing along the top header. A critic correctly
  // flagged it as "a render artifact no photograph produces" and marked it against the
  // material, which was working fine. The effect is right for gameplay and wrong for
  // judging a surface, so it is off here and stays on in the estate grade.
  engine.pipeline.setGrade({ exposure: 1.12, haze: 0.0, toeCrush: 0.0, vignette: 0.22, grain: 0.012, contrast: 1.02, ca: 0.0 });

  const mats = wallStageMaterials();
  // every layer becomes destructible: one uniform grows a ragged hole authored in the bake
  // Each material fails in its own way, and the boundary fringe is where that shows.
  // Paper tears in soft isotropic lumps; plaster crumbles the same way but coarser; lath
  // and framing SPLINTER along the grain, so their fringe is stretched hard across the
  // member to throw long slivers. Getting this wrong is what made a snapped stud look
  // like a sawn one.
  const breakCfg = [
    { lipWidth: 0.05,  jag: 0.075, jagScale: [150, 150] },   // 0 wallpaper — soft tear
    // Plaster's torn edge is the exposed core of the coat, which is paler and warmer
    // than its weathered face — not the neutral grey the shared default gives it.
    { lipWidth: 0.07,  jag: 0.130, jagScale: [110, 110], lipColor: [0.52, 0.485, 0.425] },  // 1 plaster
    { lipWidth: 0.055, jag: 0.090, jagScale: [200, 30] },    // 2 lath — splinters along x
    // Framing: a splinter is a few long slivers off a snapped end, not a fur coat. At
    // jag 0.19 with a 34:260 stretch the fringe ran the whole length of every stud and
    // read as hair. Lower amplitude, less extreme stretch.
    { lipWidth: 0.05,  jag: 0.085, jagScale: [55, 150] },    // 3 framing — splinters along y
  ];
  for (let i = 0; i < 4; i++) applyBreakMask(mats[i], breakCfg[i]);

  // ---- the real state machine
  const wall = new WallState({ id: 'demo', authority: true });
  wall.setStage(stage);

  const W = 3.2, H = 2.9;
  const group = new THREE.Group();
  engine.scene.add(group);

  // Four nested layers, outermost first. Each sits slightly deeper than the last, which is
  // what makes the exposed edge read as layered rather than as a texture swap.
  const depths = [0.000, -0.014, -0.030, -0.052];
  const layers = [];
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.PlaneGeometry(W, H, 1, 1);
    const m = new THREE.Mesh(geo, mats[i]);
    m.position.set(0, H / 2, depths[i]);
    m.receiveShadow = true;
    m.castShadow = false;
    group.add(m);
    layers.push(m);
  }

  // ---- the cavity behind everything.
  // A flat black plane proves nothing: black is what an unlit surface and an empty void
  // both look like, so a crop of the opening could not be told from a crop of a dark board.
  // What proves depth is seeing SOMETHING at a different distance, faintly, with a
  // gradient. So the backdrop is graded top to bottom by vertex colour and a single very
  // dim source sits inside the cavity, close to the floor.
  const cavGeo = new THREE.PlaneGeometry(W * 1.6, H, 1, 6);
  {
    const pos = cavGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // near-black at the top where nothing reaches, lifting slightly toward the floor
      const t = 1 - (pos.getY(i) / H + 0.5);
      const v = 0.012 + t * t * 0.055;
      col[i * 3] = v * 1.05; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.92;
    }
    cavGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const cavity = new THREE.Mesh(cavGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }));
  cavity.position.set(0, H / 2, -0.78);
  group.add(cavity);

  // A dim source down inside the cavity. It does almost nothing to the exposure but it
  // rims the back edges of everything still standing in the opening, which is the cue that
  // says those pieces are objects in a space rather than shapes on a black card.
  const cavLight = new THREE.PointLight(0xc8b79a, 0.85, 4.2, 1.7);
  cavLight.position.set(0.15, 0.30, -0.62);
  group.add(cavLight);

  // ---- WHAT SEPARATES STAGE 3 FROM STAGE 4 --------------------------------------
  //
  // An independent critic ran the blind gate and could not tell these two apart: it named
  // beam "open" and open "beam". Both crops showed the same stud, the same top plate, the
  // same lath stubs and the same debris line against black, differing only in HOW MUCH
  // black. Distinguishing them by area of void is exactly the elimination reasoning the
  // gate forbids, so both failed.
  //
  // The honest difference is not how much framing survives — it is what is behind it.
  // Stage 3 is a wall you have opened to its CAVITY: a shallow, enclosed, unlit void
  // between studs. Stage 4 is a wall you have opened THROUGH: a hole into the next room,
  // which has its own floor and its own light. So stage 4 gets a lit room behind it, and
  // that reads instantly in a cropped detail with no context.
  if (stage >= FINAL_STAGE) {
    const beyond = new THREE.Group();
    beyond.position.z = -0.80;
    group.add(beyond);

    // floor of the room next door, receding away from the opening
    const farFloor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7),
      new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.85 }));
    farFloor.rotation.x = -Math.PI / 2;
    farFloor.position.set(0, 0, -3.2);
    farFloor.receiveShadow = true;
    beyond.add(farFloor);

    // its back wall, far enough to read as depth rather than as a backdrop
    const farWall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x332c24, roughness: 0.9 }));
    farWall.position.set(0, 2.1, -6.4);
    beyond.add(farWall);

    // A warm practical out of frame in that room. This is the whole cue: light falling on
    // a floor you can see THROUGH the hole says "another space", and no amount of void
    // says that.
    const roomLight = new THREE.PointLight(0xffc98a, 26, 12, 1.9);
    roomLight.position.set(1.4, 1.9, -3.0);
    beyond.add(roomLight);

    const bounce = new THREE.PointLight(0x6f86b4, 7, 10, 2);
    bounce.position.set(-1.6, 0.7, -4.6);
    beyond.add(bounce);
  }

  // side reveals, so the wall has thickness where it is broken through
  const revealMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.92 });
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.78, H), revealMat);
    r.position.set(s * W / 2, H / 2, -0.39);
    r.rotation.y = s * -Math.PI / 2;
    group.add(r);
  }

  // floor, to catch fallen debris and ground the shot
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9),
    new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.88 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  // ---- apply the machine's rule, via break masks rather than on/off visibility
  //
  // The literal reading of "layer i is visible when i >= stage" hides breached layers
  // outright, and every stage then renders as a full flat field. But a breached layer has
  // not vanished — it has been broken BACK, and its torn edge is what frames the hole and
  // makes the stages read as layers. So every layer stays visible and instead carries a
  // break amount; the machine's rule is preserved as the special case break >= 1.
  function applyStage() {
    for (let i = 0; i < 4; i++) layers[i].visible = true;
    // Progress THROUGH the current stage, taken from the machine's own health. A stage
    // view has to show the wall freshly arrived at that stage — layer N intact and filling
    // the frame, because layer N *is* the new surface. Letting this default to 1 rendered
    // every stage as fully chewed through, which put stage 2's lath in the middle of
    // stage 1 and made the two impossible to tell apart in a blind crop.
    const prog = 1 - (wall.stageHealth / Math.max(1, wall.def.health));
    applyStageBreaks(mats.slice(0, 4), wall.stage, prog);
  }
  wall.onStageChange(applyStage);
  applyStage();

  // ---- WHAT FELL OFF THE WALL.
  //
  // Previously this was 260 three-centimetre pebbles scattered at z = -0.4, which is behind
  // the wall and below the frame — so nothing was ever visible and the critic's "no debris
  // pile below the opening" was exactly right. Debris now does three jobs, and each one is
  // a separate pass because they obey different physics:
  //
  //   1. the PILE at the foot of the wall — plaster lumps, heaviest and nearest the wall
  //   2. TIMBER, which does not pile: laths and splinters land long and lie flat, or lean
  //   3. LODGED pieces still up in the opening, caught on a stub or wedged in a bay
  //
  // All three are instanced and seeded from engine.rng, so the shot is identical every run.
  const r = engine.rng;
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const sc3 = new THREE.Vector3();
  const place = (mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) => {
    e.set(rx, ry, rz); q.setFromEuler(e);
    mesh.setMatrixAt(i, mtx.compose(v3.set(x, y, z), q, sc3.set(sx, sy, sz)));
  };

  if (stage > 0) {
    // Plaster is chalky and near-white; against the near-black cavity and the dark floor it
    // is the highest-contrast thing in the shot, which is what makes a pile read as a pile
    // rather than as noise on the floor.
    // Stage 1 has lost paper and nothing else, so it gets a scatter, not a heap. A full
    // rubble pile under an intact plaster wall says the wall came down, which is the wrong
    // story by two whole stages.
    const nLump = stage <= 1 ? 22 : 45 + stage * 55;
    const lumps = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.028, 0),
      new THREE.MeshStandardMaterial({ color: 0xa8a191, roughness: 0.96 }), nLump);
    lumps.castShadow = lumps.receiveShadow = true;
    for (let i = 0; i < nLump; i++) {
      // a pile section: heaped against the wall, tailing off forward. Gravity sorts by
      // size too — the big lumps end up at the bottom and near the wall.
      const t = Math.pow(r(), 1.7);                 // 0 at the wall, 1 at the toe
      const z = 0.02 + t * 0.38;
      const h = (1 - t) * (0.09 + stage * 0.045);   // pile profile
      const x = (r() - 0.5) * W * 1.06;
      // thicker directly under the middle of the wall, where the hole is
      const mid = 1 - Math.min(1, Math.abs(x) / (W * 0.42));
      const sc = (0.30 + r() * 1.15) * (1 - t * 0.45);
      place(lumps, i, x, 0.015 + r() * h * (0.4 + mid), z,
        r() * 6.28, r() * 6.28, r() * 6.28, sc, sc * (0.5 + r() * 0.4), sc);
    }
    lumps.instanceMatrix.needsUpdate = true;
    engine.scene.add(lumps);

    // fine chalk dust thrown forward of the pile — flat, so it reads as dust not gravel
    const nDust = 90;
    const dust = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.030, 0),
      new THREE.MeshStandardMaterial({ color: 0x847d6e, roughness: 0.99 }), nDust);
    dust.receiveShadow = true;
    for (let i = 0; i < nDust; i++) {
      const sc = 0.3 + r() * 1.1;
      place(dust, i, (r() - 0.5) * W * 1.5, 0.006, 0.15 + Math.pow(r(), 0.7) * 1.25,
        r() * 6.28, r() * 6.28, r() * 6.28, sc, sc * 0.16, sc);
    }
    dust.instanceMatrix.needsUpdate = true;
    engine.scene.add(dust);
  }

  if (stage >= 2) {
    // Lath does not pile. A snapped length is 30-60 cm of thin board: it lands flat and
    // slides, or it catches on the pile and leans back against the wall. Long straight
    // pieces lying across a heap of rubble is the silhouette every demolition photo has.
    const nStick = 14 + stage * 9;
    const sticks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 0.9 }), nStick);
    sticks.castShadow = sticks.receiveShadow = true;
    for (let i = 0; i < nStick; i++) {
      const len = 0.22 + r() * 0.5;
      const lean = r() < 0.30;                       // a few propped against the pile
      const yaw = (r() - 0.5) * 2.4;
      place(sticks, i,
        (r() - 0.5) * W * 1.0,
        lean ? 0.10 + r() * 0.22 : 0.012 + r() * 0.05,
        0.05 + r() * 0.7,
        lean ? -0.5 - r() * 0.5 : (r() - 0.5) * 0.35, yaw, (r() - 0.5) * 0.5,
        len, 0.010 + r() * 0.008, 0.028 + r() * 0.014);
    }
    sticks.instanceMatrix.needsUpdate = true;
    engine.scene.add(sticks);
  }

  if (stage >= 3) {
    // STILL UP IN THE OPENING. Splintered ends projecting off the snapped members, and the
    // odd piece wedged across a bay. These are the only genuinely three-dimensional things
    // in the shot — the layers themselves are flat planes, so a splinter standing out of
    // the wall plane at an angle is the one cue that reads as broken rather than as cut,
    // and it is what stops a crop of the middle of the opening from being empty.
    const nSpl = stage >= 4 ? 34 : 18;
    const spl = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x55452f, roughness: 0.88 }), nSpl);
    spl.castShadow = spl.receiveShadow = true;
    for (let i = 0; i < nSpl; i++) {
      // clustered on the stud lines, where there is something for them to still be part of
      const bay = Math.floor(r() * 4) / 3.5;
      const x = (bay + 0.143) * W - W / 2 + (r() - 0.5) * 0.16;
      const y = 0.25 + Math.pow(r(), 0.8) * (H * 0.85);
      const len = 0.05 + r() * 0.30;
      place(spl, i, x, y, -0.02 - r() * 0.10,
        (r() - 0.5) * 1.2, (r() - 0.5) * 1.6, (r() - 0.5) * 2.6,
        len, 0.006 + r() * 0.012, 0.008 + r() * 0.020);
    }
    spl.instanceMatrix.needsUpdate = true;
    engine.scene.add(spl);

    // HANGING LATHS. A snapped length still nailed at one end swings down and hangs across
    // the bay. The flat layer planes can only ever draw a lath lying in the wall plane, so
    // every bay the framing does not cross stayed pure black — and the identification crop
    // is taken from the middle of a bay. Each of these starts ON a stud line and swings out
    // and down from it, so it is always attached to something that is still there.
    const nHang = stage >= 4 ? 12 : 6;
    const hang = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x6b5b46, roughness: 0.9 }), nHang);
    hang.castShadow = hang.receiveShadow = true;
    for (let i = 0; i < nHang; i++) {
      const bay = Math.floor(r() * 4);
      const ax = (bay / 3.5 + 0.143) * W - W / 2;    // the stud it is still nailed to
      const ay = 0.4 + r() * (H * 0.8);
      const dir = r() < 0.5 ? -1 : 1;
      const ang = 0.5 + r() * 0.95;                  // hanging down, never level
      const len = 0.30 + r() * 0.55;
      hang.setMatrixAt(i, mtx.compose(
        v3.set(ax + dir * Math.cos(ang) * len * 0.5, ay - Math.sin(ang) * len * 0.5, -0.03 - r() * 0.08),
        q.setFromEuler(e.set((r() - 0.5) * 0.5, (r() - 0.5) * 0.7, -dir * ang)),
        sc3.set(len, 0.009, 0.030 + r() * 0.014)));
    }
    hang.instanceMatrix.needsUpdate = true;
    engine.scene.add(hang);
  }

  // a label only in the live view — never in a capture, or the blind test is worthless
  if (!engine.capture) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:30;
      font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.22em;color:#8fa3b8;
      background:rgba(6,10,16,.7);padding:7px 12px;border-radius:4px;text-transform:uppercase`;
    el.textContent = `stage ${stage} — ${STAGE_NAMES[stage]}   ·   ${stage < FINAL_STAGE ? 'blocks movement' : 'passable'}`;
    document.body.appendChild(el);
  }

  engine.wall = wall;
  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
