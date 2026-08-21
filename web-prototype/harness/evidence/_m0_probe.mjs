// probe: five staged episodes, with and without the shipped refit.
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; }, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};
const w = console.warn, e = console.error; console.warn = () => {}; console.error = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {}, readRenderTargetPixels: (a,b,c,d,ee,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const SP = await import(s_('game/spaces.js'));
const { Player } = await import(s_('game/player.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const EXP = await import(s_('views/expedition.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, { panels: SP.PANELS });
console.warn = w; console.error = e;

function show({ refit, episodes = 5 }) {
  let s = 11; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const scene = new THREE.Scene();
  const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
  const LOADOUT = EXP.recordLoadout(player);
  const body = { root: player.root, rig: player.rig, height: player.height, radius: player.radius, get noise() { return player.noise; } };
  const hunter = new HunterAI({ room, scene, rng, position: room.spawn.hunter.clone(), noise: new NoiseBus(), bangPolicy: 'off' });
  hunter.setTargets([body]);
  const out = [];
  const DT = 1 / 60;
  for (let ep = 1; ep <= episodes; ep++) {
    // --- arm()
    if (refit) EXP.refitLoadout(player, LOADOUT);
    for (const it of [...field.items]) { it.root.removeFromParent(); field.take(it); }
    hunter._pull = null;
    const c = room.anchor('ballroom.centre');
    player.pos.set(c.x, 0, c.z); player.facing = Math.PI; player.vel.set(0,0,0);
    hunter.root.position.set(c.x + 4, 0, c.z); hunter.vel.set(0,0,0);
    hunter.awareness = 1; hunter.state = 'PURSUE'; hunter.target = body; hunter.contact = 0;
    hunter.searchTimer = 0; hunter.lastKnown.copy(player.root.position); hunter.resetCombat();
    let outcome = null, simT = 0;
    hunter.onKill = () => { if (!outcome) outcome = 'taken'; };
    let clock = 90, moved = 0; const start = player.pos.clone();
    for (let i = 0; i < 90 / DT && !outcome; i++) {
      simT = i * DT; clock -= DT;
      player.aimYaw = 0;
      player.update(DT, simT, { move: { x: 0, y: 1 }, run: true, aimYaw: 0, aimPitch: 0 });
      room.update(DT);
      hunter.update(DT, simT);
      if (clock <= 0) { outcome = 'held'; break; }
    }
    moved = player.pos.distanceTo(start);
    out.push({ ep, outcome, t: +simT.toFixed(2), gait: player.caps.gait, canRun: player.caps.canRun,
      limbs: EXP.LOADOUT_SOCKETS.filter((k) => player.rig.occupant(k) !== 'empty').length,
      field: field.items.length, moved: +moved.toFixed(2) });
  }
  return out;
}
console.log('WITH the refit:');
for (const r of show({ refit: true })) console.log('  ', JSON.stringify(r));
console.log('WITHOUT (what shipped):');
for (const r of show({ refit: false })) console.log('  ', JSON.stringify(r));
