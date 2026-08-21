// throwaway: can the real Player boot headless?
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; }, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};
const realWarn = console.warn; console.warn = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {},
  readRenderTargetPixels: (a,b,c,d,e,buf) => { buf[0]=200;buf[1]=200;buf[2]=200; if (buf.length>3) buf[3]=255; } });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn;
const { LimbField } = await import(s_('game/limbs.js'));
const { Player } = await import(s_('game/player.js'));
const scene = new THREE.Scene();
const lcg = (seed) => { let x=(seed*2654435761)>>>0; return () => { x=(x*1664525+1013904223)>>>0; return x/4294967296; }; };
const rng = lcg(1);
const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
player.pos.copy(room.spawn.player[0]);
console.log('player ok', player.pos, 'caps', player.caps.gait, 'height', player.height, 'radius', player.radius);
for (let i=0;i<180;i++) player.update(1/60, i/60, { move:{x:0,y:1}, run:true, aimYaw: Math.PI, aimPitch: 0 });
console.log('after 3s run:', player.pos.x.toFixed(2), player.pos.z.toFixed(2), 'speed', player.speed.toFixed(2), 'noise', player.noise.toFixed(2));
