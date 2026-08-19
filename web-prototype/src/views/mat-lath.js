import * as THREE from 'three';
import { studio } from './_studio.js';
import { wallpaperMat, plasterMat, lathMat } from '../materials/surfaces/wallstages.js';
import { applyBreakMask, setBreak } from '../materials/breakmask.js';

/**
 * mat.lath — exposed riven lath, the stage-2 wall layer (wallpaper -> plaster -> LATH ->
 * beam -> brick, see docs/design/dig.md). NOT judged as a flat swatch: the brief and the
 * reference index (refs/REFERENCE_INDEX.md, "refs/lath/ — THE most important category")
 * are explicit that this stage has to be identified from a cropped screenshot with no
 * context, so the specimen has to be built the way it is actually seen — through a ragged
 * hole torn in the plaster coat above it.
 *
 * Zero new shader work here. `wallpaperMat` / `plasterMat` / `lathMat`
 * (src/materials/surfaces/wallstages.js) and the break-mask mechanism
 * (src/materials/breakmask.js) already exist, are already tuned against refs/lath (see the
 * header comment in wallstages.js), and already carry `wall.2.lath` to WEAK 66% — the best
 * score of the seven wall pieces. This view is a fresh, purpose-built specimen composition
 * for the *material catalog* piece: studio lighting (bright, controlled — this is judged
 * beside mat.plaster / mat.walnut / mat.marble, not beside the dark game grade) rather than
 * wall-stage.js's estate() rig, a single fixed break state instead of the wall state
 * machine (no gameplay progression to show here, just the stage), and no beam/framing
 * layer (out of scope for this piece — the framing behind is suggested with two plain stud
 * boxes for depth, the same minimal cue wall-stage.js uses).
 *
 * Reference read (opened, not guessed):
 *   lath-kent.jpg                 the stage-2 texture bar: full-frame horizontal lath field,
 *                                  even gaps, warm bare timber, nail fixings, plank-to-plank
 *                                  colour drift. This is why the lath layer's OWN break is
 *                                  left almost fully intact (0.10) rather than chewed open —
 *                                  the hero shot is the clean field, not a hole in the lath.
 *   lath-clay-plaster-ceiling.jpg the break edge: "ragged crumbling lip, never a clean line".
 *                                  That is exactly what applyBreakMask's uLipWidth/uJag pair
 *                                  draws, reused unchanged from wall-stage.js's stage-2 tuning
 *                                  (lipWidth 0.055, jag 0.09, jagScale [200,30] — stretched
 *                                  hard along x so the plaster tears in strips across the lath
 *                                  run, not in round bites).
 *   refs/_sheets/lath.png         contact sheet, for the field-level overview (plaster keys
 *                                  bridging the gaps, gaps reading near-black, no two laths
 *                                  quite the same colour) — all already baked into LATH_SURFACE
 *                                  and not re-derived here.
 * Skipped per the index: lath-metal-over-wood-01/02.jpg (expanded metal lath — wrong period,
 * wrong material for this estate; lathMat draws riven timber lath with wood grain and nail
 * heads, never a wire mesh).
 */
export default async function view() {
  const engine = await studio({
    // Mid-grey ground, not the art-sheet near-white — same reasoning as mat-walnut.js /
    // mat-marble.js: the cavity behind the lath goes near-black and the plaster lip is
    // near-white, so a white cyc leaves nothing in frame darker than the specimen's own
    // shadow and the depth cue (something visible behind the gaps, at a different distance)
    // has no contrast to read against.
    bg: 0x4e535a,
    envIntensity: 0.80,
    // Same camera geometry as wall-stage.js's stage view (proven to fill frame with this
    // exact W=3.2/H=2.9 panel at this fov/distance — wall.2.lath is WEAK 66%, the best
    // score of the seven wall pieces). A tighter/closer camera tried first left the near
    // 5.12 m cavity backdrop plane covering the whole frame outside the panel silhouette
    // in solid near-black — the panel read as floating over a void instead of as a wall.
    cameraPos: [0, 1.5, 2.6],
    target: [0, 1.05, 0],
    fov: 46,
  });

  // A low raking key. Lath's whole identity is relief: the milled section of each board
  // (deep gap floor, rounded arris, cupped face), the nail heads, the plaster keys bulging
  // out of the gaps. Straight-on light flattens every one of those to a flat painted stripe,
  // which is the single most repeated failure mode called out in wallstages.js's own header.
  engine.lights.key.position.set(-3.3, 3.0, 2.1);
  engine.lights.key.intensity = 3.7;
  engine.lights.key.shadow.camera.far = 14;
  engine.lights.key.shadow.mapSize.set(2048, 2048);
  engine.lights.key.shadow.bias = -0.0004;
  engine.lights.key.shadow.normalBias = 0.014;
  engine.lights.fill.intensity = 1.05;
  engine.lights.fill.color.setHex(0xdce6f5);
  engine.lights.rim.intensity = 1.5;

  const W = 3.2, H = 2.9;   // matches wall-stage.js — lathMat's pitch (30 laths, 3.5 studs)
                              // was tuned against exactly this panel size

  // ---- the three layers, outermost first -------------------------------------------------
  const wallpaper = wallpaperMat();
  const plaster = plasterMat();
  const lath = lathMat();

  applyBreakMask(wallpaper, { lipWidth: 0.05, jag: 0.075, jagScale: [150, 150] });
  applyBreakMask(plaster, {
    lipWidth: 0.07, jag: 0.130, jagScale: [110, 110], lipColor: [0.52, 0.485, 0.425],
  });
  // lath snaps along the grain: the fringe is stretched hard in x (200:30) so the tear
  // reads as strips, not round bites — the same tuning wall-stage.js uses for stage 2.
  applyBreakMask(lath, { lipWidth: 0.055, jag: 0.090, jagScale: [200, 30] });

  // Paper: essentially gone. Plaster: torn well back so a broad field of lath is exposed —
  // the break field is radial from panel centre PLUS independent noise (see
  // breakOrderField in wallstages.js), so a threshold too low left noise-driven islands of
  // full-strength plaster scattered well into the middle of the panel — large, hard-edged,
  // and dominating the frame over the lath they were supposed to be clearing away from.
  // 0.83 measured that way; 0.89 is wall-stage.js's own number for "plaster one stage
  // behind an exposed-lath wall" (applyStageBreaks: age 1 -> 0.84 + 0.05), already proven
  // on wall.2.lath, so matched here rather than re-derived. Lath: nearly intact (0.10) —
  // this is the hero material and the reference bar (lath-kent.jpg) is a clean full field,
  // not a hole punched in the lath itself. The small amount left is what puts a couple of
  // broken/splintered ends near the panel's dead centre, which is exactly where a blind
  // crop is taken and exactly what lath-straw-lime-closeup shows there.
  setBreak(wallpaper, 0.94);
  setBreak(plaster, 0.89);
  setBreak(lath, 0.10);

  const group = new THREE.Group();
  engine.scene.add(group);

  const depths = [0.000, -0.014, -0.030];
  const mats = [wallpaper, plaster, lath];
  const layers = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mats[i]);
    m.position.set(0, H / 2, depths[i]);
    m.receiveShadow = true;
    m.castShadow = false;
    group.add(m);
    layers.push(m);
  }

  // ---- the cavity behind everything -------------------------------------------------------
  // A flat black plane proves nothing — black is what an unlit surface and an empty void
  // both look like. What proves depth is something visible at a different distance: a
  // gradient backdrop plus a dim source low in the cavity, and two stud faces the lath's own
  // gaps let you see through (LATH_SURFACE already draws a dim stud face in the gap itself;
  // this puts the same stud out in open space too, where a whole bay is missing).
  const cavGeo = new THREE.PlaneGeometry(W * 1.6, H, 1, 6);
  {
    const pos = cavGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = 1 - (pos.getY(i) / H + 0.5);
      const v = 0.012 + t * t * 0.055;
      col[i * 3] = v * 1.05; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.92;
    }
    cavGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const cavity = new THREE.Mesh(cavGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }));
  cavity.position.set(0, H / 2, -0.80);
  group.add(cavity);

  const cavLight = new THREE.PointLight(0xc8b79a, 0.80, 4.2, 1.7);
  cavLight.position.set(0.15, 0.30, -0.62);
  group.add(cavLight);

  const studMat = new THREE.MeshStandardMaterial({ color: 0x554637, roughness: 0.93 });
  for (const sx of [-0.86, 0.63]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.095, 2.55, 0.075), studMat);
    st.position.set(sx, H / 2, -0.86);
    st.castShadow = st.receiveShadow = true;
    group.add(st);
  }

  // side reveals, so the wall has thickness where the plaster is broken through
  const revealMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.92 });
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.7, H), revealMat);
    r.position.set(s * W / 2, H / 2, -0.35);
    r.rotation.y = s * -Math.PI / 2;
    group.add(r);
  }

  // ---- floor + what fell off the wall ------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9),
    new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.88 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  // Deterministic — no Math.random(), capture must agree run to run.
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

  // Chalky plaster lumps, heaped against the wall — every hole-in-plaster reference has
  // debris directly below it (refs/lath: "debris obeys gravity").
  const nLump = 30;
  const lumps = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.026, 0),
    new THREE.MeshStandardMaterial({ color: 0xa8a191, roughness: 0.96 }), nLump);
  lumps.castShadow = lumps.receiveShadow = true;
  for (let i = 0; i < nLump; i++) {
    const t = Math.pow(r(), 1.7);
    const z = 0.02 + t * 0.36;
    const h = (1 - t) * 0.16;
    const x = (r() - 0.5) * W * 1.0;
    const mid = 1 - Math.min(1, Math.abs(x) / (W * 0.42));
    const sc = (0.28 + r() * 1.05) * (1 - t * 0.45);
    place(lumps, i, x, 0.014 + r() * h * (0.4 + mid), z,
      r() * 6.28, r() * 6.28, r() * 6.28, sc, sc * (0.5 + r() * 0.4), sc);
  }
  lumps.instanceMatrix.needsUpdate = true;
  engine.scene.add(lumps);

  // Snapped lath sticks — they do not pile, they land flat or lean, long and thin.
  const nStick = 16;
  const sticks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 0.9 }), nStick);
  sticks.castShadow = sticks.receiveShadow = true;
  for (let i = 0; i < nStick; i++) {
    const len = 0.20 + r() * 0.46;
    const lean = r() < 0.30;
    const yaw = (r() - 0.5) * 2.4;
    place(sticks, i,
      (r() - 0.5) * W * 0.95,
      lean ? 0.10 + r() * 0.20 : 0.012 + r() * 0.045,
      0.05 + r() * 0.66,
      lean ? -0.5 - r() * 0.5 : (r() - 0.5) * 0.35, yaw, (r() - 0.5) * 0.5,
      len, 0.009 + r() * 0.007, 0.026 + r() * 0.013);
  }
  sticks.instanceMatrix.needsUpdate = true;
  engine.scene.add(sticks);

  // fine chalk dust thrown forward of the pile
  const nDust = 60;
  const dust = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.028, 0),
    new THREE.MeshStandardMaterial({ color: 0x847d6e, roughness: 0.99 }), nDust);
  dust.receiveShadow = true;
  for (let i = 0; i < nDust; i++) {
    const sc = 0.3 + r() * 1.0;
    place(dust, i, (r() - 0.5) * W * 1.3, 0.006, 0.14 + Math.pow(r(), 0.7) * 1.0,
      r() * 6.28, r() * 6.28, r() * 6.28, sc, sc * 0.16, sc);
  }
  dust.instanceMatrix.needsUpdate = true;
  engine.scene.add(dust);

  // ---- chrome ball, to prove the environment is doing real work ---------------------------
  const cb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04 }));
  cb.position.set(-1.15, 0.11, 0.62);
  cb.castShadow = true;
  engine.scene.add(cb);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
