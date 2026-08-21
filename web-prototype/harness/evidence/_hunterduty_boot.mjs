#!/usr/bin/env node
/** throwaway probe — can the real HunterAI be driven in bare node? */
const HERE = new URL('..', import.meta.url);
const SRC = new URL('../../src/', HERE);
const s = (p) => new URL(p, SRC).href;

globalThis.location = { search: '' };
// The ONLY DOM the hunter rig touches: `robot.js brandDecal` -> THREE.TextureLoader -> ImageLoader,
// which does `document.createElementNS('img')` and sets `.src`. Nothing reads the pixels here.
globalThis.document = globalThis.document ?? {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; },
    addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};

const stubRenderer = () => ({
  getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {},
  readRenderTargetPixels: (rt, x, y, w, h, buf) => { buf[0]=200; buf[1]=200; buf[2]=200; if (buf.length>3) buf[3]=255; },
});

const warns = []; const realWarn = console.warn; console.warn = (...a) => warns.push(a.map(String).join(' '));
const { initBaker } = await import(s('materials/baker.js'));
initBaker(stubRenderer());
const RM = await import(s('game/room.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn;

console.log('spaces:', room.spaces.map((x) => x.id).join(','));
console.log('spawn hunter:', room.spawn?.hunter?.toArray?.().map((v)=>+v.toFixed(2)));
console.log('spawn player:', room.spawn?.player?.map((p)=>p.toArray().map((v)=>+v.toFixed(2))));
console.log('patrolRoute:', (room.patrolRoute?.() ?? []).map((r)=>`${r.space}@${r.dwell}`).join(' '));
console.log('panels:', room.panels?.length, 'floorY', room.floorY);
console.log('anchors sample:', typeof room.anchor);

const THREE = await import('three');
const { HunterAI } = await import(s('game/hunter-ai.js'));
const scene = new THREE.Scene();
let seed = 12345;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const h = new HunterAI({ room, scene, rng, position: room.spawn.hunter.clone(), bangPolicy: 'auto' });
console.log('hunter built. state', h.state, 'stage', h.stage, 'pos', h.root.position.toArray().map((v)=>+v.toFixed(2)));
h.setTargets([]);
for (let i = 0; i < 60; i++) h.update(1/60, i/60);
console.log('after 1s:', h.state, h.root.position.toArray().map((v)=>+v.toFixed(2)), 'speed', h.speed.toFixed(3));
console.log('warns:', warns.length);
