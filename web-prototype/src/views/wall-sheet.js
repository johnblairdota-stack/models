import * as THREE from 'three';
import { estate, labels } from './_studio.js';
import { wallStageMaterials } from '../materials/surfaces/wallstages.js';
import { WallState, STAGE_NAMES, FINAL_STAGE } from '../destruction/wall.js';
import { applyBreakMask, applyStageBreaks } from '../materials/breakmask.js';

/**
 * All five destruction stages standing side by side.
 *
 * This is the view the blind identification gate is really about: five samples of the same
 * wall, same lighting, same scale, nothing to give the answer away. If two of them can be
 * confused with each other then both of them fail, and the only honest way to see that is
 * to put them next to each other.
 *
 * Two things make the comparison fair, and both are easy to get wrong:
 *
 *   1. EVERY PANEL SHOWS THE SAME PIECE OF WALL. Each is a uv window centred on the break
 *      origin and sized to the panel's real dimensions, so lath pitch, stud spacing and
 *      damask repeat come out at identical physical scale on all five. Stretching a 3.2 m
 *      wide texture onto a 1 m panel would have turned the studs into a picket fence, and
 *      the comparison would then have been between five scales rather than five stages.
 *   2. EVERY PANEL RUNS THE REAL STATE MACHINE. Five independent WallStates and five
 *      independent material sets — the baker caches by key so all five share one bake, but
 *      each gets its own material instance and therefore its own uBreak. Sharing materials
 *      would have shown whichever stage happened to be set last, five times.
 *
 * No labels in a capture: a caption on a comparison sheet destroys the thing the sheet is
 * for, so they exist only in the live view.
 */
export default async function view(args = {}) {
  const engine = await estate({
    cameraPos: [0, 1.30, 4.55],
    target: [0, 1.00, 0],
    fov: 40,
    far: 40,
    envIntensity: 1.05,
  });

  // The same rig as the single-stage view, so a panel here and the same stage on its own
  // page are lit identically and a critic can hold one against the other.
  const key = new THREE.DirectionalLight(0xfff0dc, 5.2);
  key.position.set(-4.5, 4.6, 3.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 22;
  Object.assign(key.shadow.camera, { left: -3.8, right: 3.8, top: 2.8, bottom: -2.8 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  engine.scene.add(key);

  const fill = new THREE.DirectionalLight(0x9fb6d8, 1.35);
  fill.position.set(3.6, 1.6, 2.6);
  engine.scene.add(fill);

  engine.pipeline.setGrade({
    exposure: 1.12, haze: 0.0, toeCrush: 0.0, vignette: 0.20, grain: 0.012, contrast: 1.02,
  });

  const breakCfg = [
    { lipWidth: 0.05,  jag: 0.075, jagScale: [150, 150] },
    { lipWidth: 0.07,  jag: 0.130, jagScale: [110, 110], lipColor: [0.52, 0.485, 0.425] },
    { lipWidth: 0.055, jag: 0.090, jagScale: [200, 30] },
    { lipWidth: 0.05,  jag: 0.085, jagScale: [55, 150] },
  ];

  const PW = 1.00, PH = 1.72, GAP = 0.13;
  const WALL_W = 3.2, WALL_H = 2.9;
  const uw = PW / WALL_W, vh = PH / WALL_H;
  const u0 = 0.46 - uw / 2, v0 = 0.54 - vh / 2;   // centred on the break origin

  function panelGeo() {
    const g = new THREE.PlaneGeometry(PW, PH, 1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * uw, v0 + uv.getY(i) * vh);
    uv.needsUpdate = true;
    return g;
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18),
    new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.88 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  const r = engine.rng;
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const sc3 = new THREE.Vector3();

  const n = FINAL_STAGE + 1;                       // five stages
  const spanX = n * PW + (n - 1) * GAP;
  const depths = [0.000, -0.014, -0.030, -0.052];
  const baseY = 0.15;
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x241f18, roughness: 0.94 });

  for (let s = 0; s < n; s++) {
    const g = new THREE.Group();
    g.position.x = -spanX / 2 + PW / 2 + s * (PW + GAP);
    engine.scene.add(g);

    const mats = wallStageMaterials();
    for (let i = 0; i < 4; i++) applyBreakMask(mats[i], breakCfg[i]);

    const wall = new WallState({ id: `sheet${s}`, authority: true });
    wall.setStage(s);

    // the cavity card, so the open panel reads as a hole rather than as a black board
    const cav = new THREE.Mesh(new THREE.PlaneGeometry(PW * 1.02, PH),
      new THREE.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.97 }));
    cav.position.set(0, baseY + PH / 2, -0.46);
    g.add(cav);
    if (s >= 3) {
      const cl = new THREE.PointLight(0xc8b79a, 0.5, 2.0, 1.8);
      cl.position.set(0.1, baseY + 0.35, -0.34);
      g.add(cl);
    }

    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(panelGeo(), mats[i]);
      m.position.set(0, baseY + PH / 2, depths[i]);
      m.receiveShadow = true;
      g.add(m);
    }

    // the cut edges of the sample, so it reads as a slab of wall and not as a poster
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(0.46, PH), edgeMat);
      side.position.set(sx * PW / 2, baseY + PH / 2, -0.23);
      side.rotation.y = sx * -Math.PI / 2;
      g.add(side);
    }
    const under = new THREE.Mesh(new THREE.PlaneGeometry(PW, 0.46), edgeMat);
    under.position.set(0, baseY, -0.23);
    under.rotation.x = Math.PI / 2;
    g.add(under);

    applyStageBreaks(mats.slice(0, 4), wall.stage,
      1 - wall.stageHealth / Math.max(1, wall.def.health));

    // What has come off this sample so far, lying at its foot. It is a fifth axis of
    // separation between the stages and it costs one instanced draw each: nothing under
    // the intact panel, then scraps, then plaster lumps, then timber and rubble.
    if (s > 0) {
      const cnt = 10 + s * 26;
      const pile = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(0.026, 0),
        new THREE.MeshStandardMaterial({ color: s >= 3 ? 0x9d9686 : 0xa8a191, roughness: 0.96 }),
        cnt);
      pile.castShadow = pile.receiveShadow = true;
      for (let i = 0; i < cnt; i++) {
        const t = Math.pow(r(), 1.6);
        const sc = (0.3 + r() * 1.0) * (1 - t * 0.4);
        e.set(r() * 6.28, r() * 6.28, r() * 6.28); q.setFromEuler(e);
        pile.setMatrixAt(i, mtx.compose(
          v3.set((r() - 0.5) * PW * 1.1,
                 0.012 + r() * (1 - t) * (0.02 + s * 0.022),
                 0.02 + t * 0.34),
          q, sc3.set(sc, sc * 0.55, sc)));
      }
      pile.instanceMatrix.needsUpdate = true;
      g.add(pile);
    }
    if (s >= 3) {
      const cnt = 8 + s * 3;
      const sticks = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 0.9 }), cnt);
      sticks.castShadow = sticks.receiveShadow = true;
      for (let i = 0; i < cnt; i++) {
        const len = 0.16 + r() * 0.34;
        e.set((r() - 0.5) * 0.4, (r() - 0.5) * 2.4, (r() - 0.5) * 0.5); q.setFromEuler(e);
        sticks.setMatrixAt(i, mtx.compose(
          v3.set((r() - 0.5) * PW, 0.014 + r() * 0.05, 0.03 + r() * 0.34),
          q, sc3.set(len, 0.010, 0.026)));
      }
      sticks.instanceMatrix.needsUpdate = true;
      g.add(sticks);
    }
    if (s >= FINAL_STAGE) {
      // Snapped lath swinging off the stud. At one metre of wall per panel, the framing
      // panel and the open panel both come down to "a stud and a noggin", and a diagonal is
      // the one thing that cannot occur on a wall that is still standing — so this is what
      // keeps the last two panels from being the same picture twice.
      const cnt = 7;
      const hang = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x6b5b46, roughness: 0.9 }), cnt);
      hang.castShadow = hang.receiveShadow = true;
      for (let i = 0; i < cnt; i++) {
        const ay = baseY + 0.25 + r() * (PH * 0.8);
        const dir = r() < 0.5 ? -1 : 1;
        const ang = 0.55 + r() * 0.9;
        const len = 0.20 + r() * 0.42;
        hang.setMatrixAt(i, mtx.compose(
          v3.set(dir * Math.cos(ang) * len * 0.5, ay - Math.sin(ang) * len * 0.5, -0.03 - r() * 0.07),
          q.setFromEuler(e.set((r() - 0.5) * 0.4, (r() - 0.5) * 0.6, -dir * ang)),
          sc3.set(len, 0.009, 0.028)));
      }
      hang.instanceMatrix.needsUpdate = true;
      g.add(hang);
    }
  }

  if (!engine.capture) {
    labels(Array.from({ length: n }, (_, s) => ({
      text: `${s} · ${STAGE_NAMES[s]}`,
      x: 50 + ((-spanX / 2 + PW / 2 + s * (PW + GAP)) / (spanX * 0.62)) * 50,
      y: 86,
      color: '#8fa3b8',
      font: '600 11px/1 ui-monospace,Menlo,monospace',
    })));
  }

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
