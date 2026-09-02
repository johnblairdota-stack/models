import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { createHunterMeshAvatar, HUNTER_PACK, HUNTER_PACK_FROM, HUNTER_SWINGS } from '../characters/hunter-mesh-avatar.js';
import { buildHunter } from '../characters/hunter.js';

/**
 * `hunter.animated` — the Meshy stage-3 hunter, STOOD IN A DOOR (`NEWHUNTER.bat`).
 *
 * The sofa lock says the hunter is a shut door: the one image that matters is the body
 * filling a hall doorway, backlit, and whether that silhouette reads as the locked stage-3
 * art. So the bench IS a doorway — jambs, lintel, light behind — not an empty sweep. The
 * procedural stage-3 hunter stands in a second identical doorway (`?proc=0` hides it) so
 * the verdict is an A/B in one capture. Extra-arm weights on the Meshy biped auto-rig
 * are a FINDING, not a thing to fake-paint. Do not invent a camera.
 *
 * Controls: `?clip=attack|combo|walk|run` starts on that role (default walk),
 * click / Space cycles roles. During a strike a red flash fires AT THE MEASURED CONTACT
 * moment (`HUNTER_SWINGS`) — if the flash and the visible impact disagree, the measurement
 * is wrong and the gate number should not be trusted. That is a look-check a capture can
 * carry, and it costs one quad.
 *
 * The GLBs are gitignored. Missing pack: the view names the Documents copy path and
 * does not stand the Lumi Bot in as a fake hunter.
 */
export default async function view(args = {}) {
  const H = 1.7;
  const engine = await studio({
    cameraPos: [0, H * 0.62, H * 2.9],
    target: [0, H * 0.52, 0],
    fov: 34,
    bg: 0x101012,
    envIntensity: 0.55,
    shadowExtent: H * 2.0,
  });
  const scene = engine.scene;

  // ---- the door: jambs + lintel + a hot slab of light behind the opening
  const doorway = (x) => {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x2a2119, roughness: 0.8 });
    const jamb = new THREE.BoxGeometry(0.14, 2.15, 0.22);
    for (const dx of [-0.55, 0.55]) {
      const j = new THREE.Mesh(jamb, wood);
      j.position.set(dx, 2.15 / 2, 0);
      g.add(j);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.16, 0.22), wood);
    lintel.position.set(0, 2.15 + 0.08, 0);
    g.add(lintel);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 2.1),
      new THREE.MeshBasicMaterial({ color: 0xffe9c4, toneMapped: false }),
    );
    glow.position.set(0, 2.15 / 2, -0.6);
    g.add(glow);
    const spill = new THREE.PointLight(0xffe0b0, 2.2, 6, 2);
    spill.position.set(0, 1.4, -0.45);
    g.add(spill);
    g.position.x = x;
    scene.add(g);
    return g;
  };

  const showProc = (args.params?.get?.('proc') ?? '1') !== '0';
  doorway(showProc ? -1.1 : 0);

  let avatar;
  try {
    avatar = await createHunterMeshAvatar({ height: H });
  } catch (err) {
    labels([
      'hunter.animated — Meshy pack MISSING',
      `Copy walking.glb running.glb attack.glb double-combo-attack.glb`,
      `from ${HUNTER_PACK_FROM}`,
      `into public/models/anim/hunter/  (gitignored; do not commit)`,
      String(err?.message ?? err),
    ]);
    console.error('[hunter.animated]', err);
    engine.finalizeScene();
    engine.markReady();
    engine.start();
    return;
  }

  avatar.group.position.x = showProc ? -1.1 : 0;
  scene.add(avatar.group);
  console.log('[hunter.animated] pack', HUNTER_PACK, 'pending:', avatar.pending);

  let proc = null;
  if (showProc) {
    doorway(1.1);
    proc = buildHunter({ stage: 3 });
    proc.root.position.x = 1.1;
    scene.add(proc.root);
  }

  // ---- clip cycling + the contact flash
  const roles = ['walk', 'run', 'attack', 'combo'];
  let role = args.params?.get?.('clip') ?? 'walk';
  if (!roles.includes(role)) role = 'walk';
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xff2418, transparent: true, opacity: 0, toneMapped: false }),
  );
  flash.position.set(avatar.group.position.x, 1.15, 0.55);
  scene.add(flash);

  let strikeClock = null; // seconds until measured contact, once a strike role is cued
  const start = (r) => {
    role = r;
    const swing = HUNTER_SWINGS.find((s) => s.role === r);
    if (swing) {
      const wind = swing.contact > 0 ? swing.contact : swing.duration || 1;
      avatar.cueStrike(r, wind);
      strikeClock = wind;
    }
  };
  start(role);
  addEventListener('keydown', (e) => { if (e.code === 'Space') start(roles[(roles.indexOf(role) + 1) % roles.length]); });
  addEventListener('pointerdown', () => start(roles[(roles.indexOf(role) + 1) % roles.length]));

  labels([`hunter.animated — Meshy stage-3 pack in the door${showProc ? ' · procedural stage 3 right' : ''}`,
    `clip: ${roles.join(' / ')} (Space cycles) · red flash = measured contact`,
    `FINDING: extra-arm weights (Meshy biped auto-rig) — do not fake-paint`]);

  let sinceStrike = 0;
  engine.onUpdate((dt) => {
    const speedFor = { walk: 1.0, run: 3.0 }[role] ?? 0;
    avatar.update(dt, { speed: speedFor });
    if (strikeClock != null) {
      strikeClock -= dt;
      if (strikeClock <= 0) { flash.material.opacity = 1; strikeClock = null; }
    }
    flash.material.opacity = Math.max(0, flash.material.opacity - dt * 3);
    const swing = HUNTER_SWINGS.find((s) => s.role === role);
    if (swing) {
      sinceStrike += dt;
      const dur = swing.duration > 0 ? swing.duration : 2;
      if (sinceStrike > dur + 0.8) { sinceStrike = 0; start(role); }
    } else sinceStrike = 0;
  });

  engine.finalizeScene();
  engine.markReady();
  engine.start();
}
