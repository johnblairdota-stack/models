// probe: can a real Player be built headless?
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; }, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};
const realWarn = console.warn, realErr = console.error;
console.warn = () => {}; console.error = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {}, readRenderTargetPixels: (a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { Player } = await import(s_('game/player.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const SP = await import(s_('game/spaces.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, { panels: SP.PANELS });
console.warn = realWarn; console.error = realErr;
const scene = new THREE.Scene();
let seed = 5; const rng = () => { seed = (seed*1664525+1013904223)>>>0; return seed/4294967296; };
const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
const p = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
p.pos.copy(room.spawn.player[0]);
p.facing = Math.PI;
console.log('player built ok. pos', p.pos.toArray().map(v=>+v.toFixed(2)).join(','), 'caps', JSON.stringify(p.caps));
// step it forward at RUN for 1s
const DT=1/60;
for (let i=0;i<60;i++) p.update(DT, i*DT, { move:{x:0,y:1}, run:true, aimYaw: Math.PI, aimPitch:0 });
console.log('after 1s RUN: pos', p.pos.toArray().map(v=>+v.toFixed(2)).join(','), 'speed', p.speed.toFixed(3), 'noise', p.noise.toFixed(3));
console.log('spaces:', room.spaces.map(s=>s.id).join(' '));
console.log('spawn.player', room.spawn.player.map(v=>v.toArray().map(x=>+x.toFixed(2)).join(',')));
console.log('spawn.hunter', room.spawn.hunter.toArray().map(x=>+x.toFixed(2)).join(','));
