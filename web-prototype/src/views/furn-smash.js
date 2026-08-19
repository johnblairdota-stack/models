/**
 * FURN.SMASH — standalone blank-room smash lineup.
 * docs/slices/task-furn-smash.md
 */

import * as THREE from 'three';
import { studio } from './_studio.js';
import { Player, ThirdPersonCamera, Input } from '../game/player.js';
import { DebrisSystem } from '../destruction/debris.js';
import { DustSystem } from '../destruction/dust.js';
import { buildSmashLab } from '../game/furn-smash-lab.js';
import { initAudio } from '../audio/audio.js';

export default async function view() {
  const engine = await studio({
    cameraPos: [0, 1.7, 6],
    target: [0, 1.1, 0],
    fov: 62,
    cyc: false,
    bg: 0x6e737a,
    envIntensity: 0.72,
    orbit: false,
    shadowExtent: 32,
    engine: { far: 90 },
  });
  const { scene } = engine;
  scene.background = new THREE.Color(0x6e737a);

  const hemi = new THREE.HemisphereLight(0xf4f0e8, 0x5a564e, 0.32);
  scene.add(hemi);
  const bounce = new THREE.DirectionalLight(0xd5dde8, 0.45);
  bounce.position.set(-10, 12, -8);
  scene.add(bounce);

  const key = engine.lights?.key;
  if (key) {
    key.position.set(16, 30, 18);
    key.intensity = 4.4;
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 90;
    Object.assign(key.shadow.camera, { left: -36, right: 36, top: 24, bottom: -24 });
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.04;
    key.shadow.camera.updateProjectionMatrix();
  }
  if (engine.lights?.fill) engine.lights.fill.intensity = 0.55;
  if (engine.lights?.rim) engine.lights.rim.intensity = 1.1;

  const debris = new DebrisSystem(scene, { perKind: 960, floorY: 0, rng: engine.rng, keepRest: true });
  const dust = new DustSystem(scene, { max: 180, rng: engine.rng });
  const room = await buildSmashLab(scene, { debris, dust });

  let avatar = null;
  try {
    const { unit4hMaterials } = await import('../materials/surfaces/robot.js');
    const { createMeshAvatar } = await import('../characters/mesh-avatar.js');
    avatar = await createMeshAvatar({ height: 1.7, materials: unit4hMaterials({}) });
  } catch (e) {
    console.error('[furn.smash] mesh avatar failed, procedural fallback:', e);
    avatar = null;
  }

  const player = new Player({ scene, world: room, rng: engine.rng, id: 'p1', avatar });
  player.pos.set(0, 0, 0);
  player.facing = 0;
  player.aimYaw = 0;
  player.aimPitch = -0.08;
  player.sledge.owned = true;
  player.sledge.equip();

  const cam = new ThirdPersonCamera(engine.camera, {
    world: room, distance: 3.6, shoulder: 0.4,
  });
  cam.yaw = 0;
  cam.pitch = -0.08;

  engine.player = player;
  engine.room = room;
  engine.cam = cam;
  engine.debris = debris;
  engine.dust = dust;
  engine.avatar = avatar;

  const input = new Input(engine.canvas, { enabled: !engine.capture });

  engine.onUpdate((dt, t) => {
    const m = input.takeMouse();
    if (m) cam.look(m.dx, m.dy);
    if (input.mouse.down) player.attack(t);
    player.update(dt, t, {
      move: input.move,
      run: input.run,
      aimYaw: cam.yaw,
      aimPitch: cam.pitch,
    });
    cam.update(dt, player);
    room.update?.(dt);
    debris.update(dt);
    dust.update(dt, engine.camera);
  });

  engine.finalizeScene();
  engine.markReady();

  if (!engine.capture) {
    const wrap = document.createElement('div');
    wrap.id = 'rrr-play-gate';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;'
      + 'background:rgba(8,10,12,.82);cursor:pointer;font:13px ui-monospace,monospace;color:#dbe7f4';
    wrap.innerHTML = `<div style="text-align:center">
      <div style="letter-spacing:.28em;font-size:11px;margin-bottom:10px">FURNITURE SMASH LAB</div>
      <button id="rrr-play-btn" style="font:700 15px/1 ui-monospace,monospace;letter-spacing:.2em;
        text-transform:uppercase;color:#08121c;background:#7dd3fc;border:0;border-radius:999px;
        padding:16px 44px;cursor:pointer">▶ Play</button>
      <div style="margin-top:16px;color:#8fa4bb;font-size:12px">WASD move · LMB smash · mesh robot · Meshy props</div>
    </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', () => {
      wrap.remove();
      engine.start();
      initAudio(engine);
      try {
        const r = engine.canvas?.requestPointerLock?.();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch { /* drag look */ }
      engine.canvas?.focus?.();
    });
  } else {
    engine.start();
  }
}
