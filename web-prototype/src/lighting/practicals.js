import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lathe } from '../world/kit.js';
import { glowPatch } from './volumetric.js';

/**
 * PRACTICALS — the visible sources.
 *
 * The rule for this project is one, at most two, real shadow-casting lights in a scene.
 * Everything else in the room that glows is a PRACTICAL: emissive geometry the camera can
 * see, plus (optionally) one cheap non-shadowing PointLight with a short range so it lifts
 * its immediate surroundings and nothing else. The composite pass's bloom does the rest;
 * a candle flame at 8x emissive reads as a candle flame without costing a light at all.
 *
 * FLICKER is deterministic. `Math.random()` anywhere in a render path makes two captures
 * of the same view different images, so every flicker here is a sum of sines keyed off a
 * per-instance phase and the engine's fixed-step clock.
 */

const _flames = [];

/** Register a flicker source. Call `driveFlicker(engine)` once per view. */
function registerFlicker(fn) { _flames.push(fn); }

export function driveFlicker(engine) {
  if (!_flames.length) return;
  const list = _flames.slice();
  _flames.length = 0;
  engine.onUpdate((dt, t) => { for (const f of list) f(t); });
}

/** The deterministic flame curve: a slow wander with an occasional sharp guttering dip. */
function flickerValue(t, phase) {
  const a = Math.sin(t * 5.3 + phase) * 0.5 + Math.sin(t * 11.7 + phase * 2.1) * 0.28
    + Math.sin(t * 23.1 + phase * 3.7) * 0.14;
  const gust = Math.max(0, Math.sin(t * 0.9 + phase * 1.3) - 0.86) * 6.0;
  return 1 + a * 0.085 - gust * 0.22;
}

// ---------------------------------------------------------------------------

/**
 * One candle: wax stub, a bright wick bead and a teardrop flame.
 * @returns THREE.Group — parent it anywhere; the flame is billboard-free on purpose
 *          (a 3 cm teardrop reads correctly from any angle and costs 60 tris).
 */
export function candle(o = {}) {
  const g = new THREE.Group();
  const h = o.h ?? 0.16;
  const r = o.r ?? 0.014;
  const phase = o.phase ?? 0;

  const waxGeo = lathe([[0, 0], [r, 0.004], [r, h * 0.9], [r * 0.86, h], [r * 0.3, h + 0.006], [0, h + 0.008]], 8);
  if (o.merge === true) {
    // The caller merges every candle's wax into one mesh. The wax is the only static part
    // of a candle — the flame and the core scale independently every frame, so they stay.
    g.userData.waxGeo = waxGeo;
  } else {
    const wax = new THREE.Mesh(waxGeo,
      o.waxMat ?? new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.62, metalness: 0 }));
    wax.castShadow = false;
    g.add(wax);
  }

  const flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.6, 1.35, 0.42),
    transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: true,
  });
  const flame = new THREE.Mesh(
    lathe([[0, 0], [0.0075, 0.006], [0.0092, 0.018], [0.0062, 0.036], [0.0022, 0.049], [0, 0.052]], 7),
    flameMat);
  flame.position.y = h + 0.006;
  flame.renderOrder = 11;
  g.add(flame);

  // the hot core: small, very bright, the thing bloom latches onto
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.0042, 6, 5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(7.0, 5.2, 3.1), toneMapped: true }));
  core.position.y = h + 0.016;
  core.scale.y = 2.1;
  g.add(core);

  let light = null;
  if (o.light !== false) {
    light = new THREE.PointLight(new THREE.Color(o.lightColor ?? 0xffa347), o.intensity ?? 0.55, o.distance ?? 3.2, 2);
    light.position.set(0, h + 0.03, 0);
    light.castShadow = false;
    g.add(light);
  }

  registerFlicker((t) => {
    const f = flickerValue(t, phase);
    flame.scale.set(0.92 + f * 0.12, f, 0.92 + f * 0.12);
    flameMat.opacity = 0.72 + f * 0.24;
    core.scale.set(f * 0.9, f * 2.1, f * 0.9);
    if (light) light.intensity = (o.intensity ?? 0.55) * f;
  });

  g.userData.light = light;
  g.userData.flameTop = h + 0.055;
  return g;
}

/**
 * A wall sconce: a brass back plate, two scrolled arms, drip pans and candles.
 * This is the estate's standard wall practical — the thing in the locked art on the
 * panelling to the right of the tapestry.
 */
export function sconce(o = {}) {
  const g = new THREE.Group();
  const brass = o.brass ?? new THREE.MeshStandardMaterial({ color: 0x9a7128, roughness: 0.32, metalness: 1.0 });
  const arms = o.arms ?? 2;
  // `merge: true` bakes the back plate, bosses, scrolled arms and drip pans into ONE brass
  // mesh, and every candle's wax into one more. Nothing in the sconce moves except the
  // flame and its core, which stay separate because they scale independently. A ballroom
  // hangs nine of these; at 5 meshes each that is 45 draw calls of pure ornament.
  const merged = o.merge === true;
  const brassParts = [], waxParts = [];
  const bake = (geo, pos, eul) => {
    const m = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(eul[0], eul[1], eul[2], 'XYZ'))
      .setPosition(pos[0], pos[1], pos[2]);
    brassParts.push(geo.clone().applyMatrix4(m));
    geo.dispose();
  };

  const backGeo = lathe([
    [0, 0], [0.055, 0.004], [0.062, 0.02], [0.048, 0.05], [0.052, 0.075],
    [0.030, 0.10], [0.034, 0.125], [0.012, 0.15], [0, 0.155],
  ], 12);
  const bossGeo = new THREE.SphereGeometry(0.030, 10, 8);
  if (merged) {
    bake(backGeo, [0, 0, 0], [-Math.PI / 2, 0, 0]);
    bake(bossGeo, [0, 0.02, 0.045], [0, 0, 0]);
  } else {
    const back = new THREE.Mesh(backGeo, brass);
    back.rotation.x = -Math.PI / 2;
    back.castShadow = true;
    g.add(back);
    const bosses = new THREE.Mesh(bossGeo, brass);
    bosses.position.set(0, 0.02, 0.045);
    g.add(bosses);
  }

  for (let i = 0; i < arms; i++) {
    const side = arms === 1 ? 0 : (i / (arms - 1)) * 2 - 1;
    const a = new THREE.Group();
    const armGeo = new THREE.TorusGeometry(0.13, 0.010, 5, 14, Math.PI * 0.85);
    const panGeo = lathe([[0, 0], [0.048, 0.006], [0.050, 0.014], [0.030, 0.016],
      [0.017, 0.020], [0.017, 0.042], [0.021, 0.046], [0, 0.046]], 10);
    const panPos = new THREE.Vector3(side * 0.155, 0.115, 0.115);
    if (merged) {
      // scrolled arm: a torus arc, which is a real S when you tilt it
      bake(armGeo, [side * 0.055, 0.03, 0.06], [Math.PI / 2, 0, side * 0.45]);
      bake(panGeo, panPos.toArray(), [0, 0, 0]);
    } else {
      const arm = new THREE.Mesh(armGeo, brass);
      arm.rotation.set(Math.PI / 2, 0, 0);
      arm.rotation.z = side * 0.45;
      arm.position.set(side * 0.055, 0.03, 0.06);
      arm.castShadow = true;
      a.add(arm);
      const pan = new THREE.Mesh(panGeo, brass);
      pan.position.copy(panPos);
      pan.castShadow = true;
      a.add(pan);
    }

    const c = candle({
      merge: merged,
      h: 0.135, r: 0.0145, phase: (o.phase ?? 0) + i * 2.3,
      intensity: o.intensity ?? 0.5, distance: o.distance ?? 3.0,
      light: o.light !== false && i === 0,
      waxMat: o.waxMat,
      // Pass-through added round 6. `candle`'s point light is 0xffa347 — red to blue 3.6:1 —
      // and in a room lit ONLY by sconces that is the colour of every lit surface, i.e. it is
      // the top luminance decile by definition. A view that has no other illuminant needs to
      // be able to say so. The flame and its core stay at their own emissive colours, which
      // is where a viewer actually reads "candle".
      lightColor: o.lightColor,
    });
    c.position.copy(panPos).add(new THREE.Vector3(0, 0.044, 0));
    if (c.userData.waxGeo) {
      waxParts.push(c.userData.waxGeo.applyMatrix4(
        new THREE.Matrix4().makeTranslation(c.position.x, c.position.y, c.position.z)));
      c.userData.waxGeo = null;
    }
    a.add(c);
    g.add(a);
  }

  if (merged) {
    const bm = new THREE.Mesh(mergeGeometries(brassParts, false), brass);
    for (const p of brassParts) p.dispose();
    bm.castShadow = true;
    bm.name = 'sconce-brass';
    g.add(bm);
    if (waxParts.length) {
      const wm = new THREE.Mesh(mergeGeometries(waxParts, false),
        o.waxMat ?? new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.62, metalness: 0 }));
      for (const p of waxParts) p.dispose();
      wm.castShadow = false;
      wm.name = 'sconce-wax';
      g.add(wm);
    }
  }

  // the wall behind a sconce is always lit — a glow decal instead of a second light
  if (o.glow !== false) {
    const gl = glowPatch({ size: o.glowSize ?? 1.7, color: o.glowColor ?? 0xffa042, strength: o.glowStrength ?? 0.30, pow: 2.6 });
    gl.position.set(0, 0.16, 0.012);
    g.add(gl);
  }
  return g;
}

/**
 * A brass desk lamp with a green glass shade — the warm accent in the locked study art.
 * The shade's inside is emissive, so the lamp glows from within; a short-range point light
 * carries the pool onto the desk and nothing beyond it.
 */
export function deskLamp(o = {}) {
  const g = new THREE.Group();
  const brass = o.brass ?? new THREE.MeshStandardMaterial({ color: 0x8e6a26, roughness: 0.30, metalness: 1.0 });

  const base = new THREE.Mesh(lathe([[0, 0], [0.075, 0.004], [0.080, 0.012], [0.062, 0.020],
    [0.030, 0.026], [0.016, 0.034], [0.014, 0.050], [0.012, 0.230], [0, 0.232]], 14), brass);
  base.castShadow = true;
  g.add(base);

  const shadeOuter = new THREE.Mesh(lathe([
    [0.020, 0.0], [0.030, 0.010], [0.120, 0.012], [0.128, 0.022], [0.126, 0.052],
    [0.100, 0.082], [0.062, 0.100], [0.040, 0.104],
  ], 20), o.shadeMat ?? new THREE.MeshPhysicalMaterial({
    color: 0x123d24, roughness: 0.22, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.08,
    side: THREE.DoubleSide, envMapIntensity: 1.2,
  }));
  shadeOuter.position.y = 0.205;
  shadeOuter.rotation.x = Math.PI;
  shadeOuter.castShadow = true;
  g.add(shadeOuter);

  // hot inner surface of the shade
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.026, 0.088, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.4, 1.35), side: THREE.BackSide, toneMapped: true }));
  inner.position.y = 0.152;
  g.add(inner);

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(9.0, 7.0, 4.4), toneMapped: true }));
  bulb.position.y = 0.158;
  g.add(bulb);

  const light = new THREE.PointLight(new THREE.Color(o.color ?? 0xffb35e), o.intensity ?? 3.4, o.distance ?? 4.2, 2);
  light.position.set(0, 0.145, 0);
  light.castShadow = false;
  g.add(light);

  // `poolColor` is overridable for the same reason `color` is: this decal lands on whatever
  // the lamp stands on, so on a view where the lamp is the brightest thing in frame it is
  // painting the TOP LUMINANCE DECILE, and 0xffb058 has r-b = 168. See light-dark.js.
  const pool = glowPatch({ size: o.poolSize ?? 1.5, color: o.poolColor ?? 0xffb058, strength: 0.42, pow: 2.0 });
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.004;
  g.add(pool);

  registerFlicker((t) => { light.intensity = (o.intensity ?? 3.4) * (0.985 + Math.sin(t * 3.1 + 1.7) * 0.015); });
  g.userData.light = light;
  return g;
}

/**
 * A standing candelabrum — the tall practical that gives a gallery its rhythm.
 * `arms` candles around a turned stem.
 */
export function candelabra(o = {}) {
  const g = new THREE.Group();
  const brass = o.brass ?? new THREE.MeshStandardMaterial({ color: 0x8e6a26, roughness: 0.34, metalness: 1.0 });
  const h = o.h ?? 1.25;
  const arms = o.arms ?? 5;

  // `merge: true` — see the note on `sconce`. Same trade, same reason.
  const merged = o.merge === true;
  const brassParts = [], waxParts = [];
  const bake = (geo, pos, eul) => {
    const m = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(eul[0], eul[1], eul[2], 'XYZ'))
      .setPosition(pos[0], pos[1], pos[2]);
    brassParts.push(geo.clone().applyMatrix4(m));
    geo.dispose();
  };

  const stemGeo = lathe([
    [0, 0], [0.12, 0.006], [0.125, 0.020], [0.085, 0.040], [0.045, 0.062],
    [0.030, 0.090], [0.026, 0.30], [0.048, 0.36], [0.030, 0.42], [0.024, 0.58],
    [0.052, 0.64], [0.026, 0.70], [0.022, h * 0.86], [0.040, h * 0.90], [0.020, h * 0.94], [0, h * 0.95],
  ], 14);
  if (merged) {
    bake(stemGeo, [0, 0, 0], [0, 0, 0]);
  } else {
    const stem = new THREE.Mesh(stemGeo, brass);
    stem.castShadow = true;
    g.add(stem);
  }

  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + 0.4;
    const R = i === 0 ? 0 : o.armR ?? 0.20;
    const y = i === 0 ? h * 0.95 : h * 0.80;
    const armPos = [Math.cos(a) * R * 0.45, y - R * 0.30, Math.sin(a) * R * 0.45];
    const panPos = new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R);
    const panGeo = lathe([[0, 0], [0.040, 0.005], [0.042, 0.012], [0.018, 0.014],
      [0.016, 0.036], [0.020, 0.040], [0, 0.040]], 9);
    if (i > 0) {
      const armGeo = new THREE.TorusGeometry(R * 0.62, 0.008, 4, 12, Math.PI * 0.9);
      if (merged) {
        bake(armGeo, armPos, [0, -a, Math.PI * 0.5]);
      } else {
        const arm = new THREE.Mesh(armGeo, brass);
        arm.position.set(armPos[0], armPos[1], armPos[2]);
        arm.rotation.set(0, -a, Math.PI * 0.5);
        g.add(arm);
      }
    }
    if (merged) {
      bake(panGeo, panPos.toArray(), [0, 0, 0]);
    } else {
      const pan = new THREE.Mesh(panGeo, brass);
      pan.position.copy(panPos);
      g.add(pan);
    }
    const c = candle({
      merge: merged,
      h: 0.19, r: 0.015, phase: i * 1.9 + (o.phase ?? 0),
      intensity: o.intensity ?? 0.34, distance: o.distance ?? 3.6,
      light: o.light !== false && i < (o.lights ?? 2),
      lightColor: o.lightColor,
    });
    c.position.copy(panPos).add(new THREE.Vector3(0, 0.038, 0));
    if (c.userData.waxGeo) {
      waxParts.push(c.userData.waxGeo.applyMatrix4(
        new THREE.Matrix4().makeTranslation(c.position.x, c.position.y, c.position.z)));
      c.userData.waxGeo = null;
    }
    g.add(c);
  }

  if (merged) {
    const bm = new THREE.Mesh(mergeGeometries(brassParts, false), brass);
    for (const p of brassParts) p.dispose();
    bm.castShadow = true;
    bm.name = 'candelabra-brass';
    g.add(bm);
    if (waxParts.length) {
      const wm = new THREE.Mesh(mergeGeometries(waxParts, false),
        o.waxMat ?? new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.62, metalness: 0 }));
      for (const p of waxParts) p.dispose();
      wm.name = 'candelabra-wax';
      g.add(wm);
    }
  }
  return g;
}

/**
 * A picture light: the small brass hood over a portrait. Emissive strip plus a very tight
 * spot so exactly one painting is lit and the wall two metres away is not.
 */
export function pictureLight(o = {}) {
  const g = new THREE.Group();
  const brass = o.brass ?? new THREE.MeshStandardMaterial({ color: 0x8e6a26, roughness: 0.34, metalness: 1.0 });
  const w = o.w ?? 0.34;

  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, w, 10, 1, false, Math.PI * 0.05, Math.PI * 1.25), brass);
  hood.rotation.z = Math.PI / 2;
  hood.rotation.y = Math.PI;
  hood.castShadow = true;
  g.add(hood);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.14, 6), brass);
  armL.position.set(0, -0.05, -0.06);
  armL.rotation.x = 0.8;
  g.add(armL);

  const strip = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, 0.035),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(5.0, 4.2, 3.0), toneMapped: true }));
  strip.rotation.x = Math.PI * 0.5 + 0.55;
  strip.position.set(0, -0.026, 0.012);
  g.add(strip);

  if (o.light !== false) {
    const sp = new THREE.SpotLight(new THREE.Color(o.color ?? 0xffcf96), o.intensity ?? 2.6,
      o.distance ?? 2.6, o.angle ?? 0.85, 0.9, 1.6);
    sp.position.set(0, -0.03, 0.05);
    sp.target.position.set(0, -0.95, 0.32);
    sp.castShadow = false;
    g.add(sp); g.add(sp.target);
    g.userData.light = sp;
  }
  return g;
}

/**
 * A fire in a grate: glowing embers, a low flame, and a warm flickering point light.
 * The hearth in the study is the only warm source at floor level and it is what stops the
 * bottom third of that room going to a flat black.
 */
export function hearthFire(o = {}) {
  const g = new THREE.Group();
  const w = o.w ?? 0.75, d = o.d ?? 0.35;

  const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.85, 0.14), toneMapped: true });
  const ember = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), emberMat);
  ember.scale.set(w * 0.5, 0.06, d * 0.5);
  ember.position.y = 0.05;
  g.add(ember);

  const flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.2, 0.95, 0.24), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true,
  });
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(lathe([[0, 0], [0.05, 0.03], [0.055, 0.09], [0.030, 0.17], [0, 0.23]], 6), flameMat);
    f.position.set((i / 4 - 0.5) * w * 0.7, 0.05, (((i * 7) % 5) / 4 - 0.5) * d * 0.5);
    f.renderOrder = 11;
    g.add(f);
    flames.push(f);
  }

  const light = new THREE.PointLight(new THREE.Color(o.color ?? 0xff7a2a), o.intensity ?? 4.2, o.distance ?? 7.0, 2);
  light.position.set(0, 0.28, 0);
  light.castShadow = o.castShadow ?? false;
  if (light.castShadow) {
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.15;
    light.shadow.camera.far = 7;
    light.shadow.bias = -0.002;
  }
  g.add(light);

  const spill = glowPatch({ size: o.spill ?? 2.6, color: 0xff6a20, strength: 0.34, pow: 2.2 });
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.01, d * 0.9);
  g.add(spill);

  registerFlicker((t) => {
    const f = flickerValue(t, o.phase ?? 0);
    light.intensity = (o.intensity ?? 4.2) * (0.72 + f * 0.34);
    emberMat.color.setRGB(3.0 * f, 0.85 * f, 0.14 * f);
    flameMat.opacity = 0.38 + f * 0.26;
    for (let i = 0; i < flames.length; i++) {
      const k = flickerValue(t * (1 + i * 0.13), i * 2.1);
      flames[i].scale.set(0.8 + k * 0.3, k * 1.25, 0.8 + k * 0.3);
    }
  });
  g.userData.light = light;
  return g;
}
