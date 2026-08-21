#!/usr/bin/env node
/**
 * _bcrit_geom — WHAT A STATIC ACTUALLY FRAMES, once it is reachable at all.
 * Throwaway critic probe. Reads only; writes nothing.
 */
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v) {}, addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ style: {}, getContext: () => null }) };
const realWarn = console.warn; console.warn = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {}, readRenderTargetPixels: (a,b,c,d,e,buf) => { buf[0]=200;buf[1]=200;buf[2]=200; if(buf.length>3) buf[3]=255; } });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { createRig, SITE_HALF_ANGLE } = await import(s_('game/director-rig.js'));
const { FOV, STING_MIN_RANGE, solve } = await import(s_('party/shots.js'));
const { cameraRoster } = await import(s_('party/coverage.js'));
const { SPACES } = await import(s_('game/spaces.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn;

const camera = { position: { set(){} }, lookAt(){}, fov: 0, updateProjectionMatrix(){} };
let subj = { runner: { x:0,y:0,z:0,yaw:0,eyeHeight:1.62 }, hunter: { x:0,y:0,z:0,yaw:0,eyeHeight:1.4 } };
const rig = createRig({ camera, room, worldSeed: 7, subjects: () => subj, unlocked: () => 99 });
const sites = rig.sites();
const DEG = 180/Math.PI;

console.log('=== the camera roster createRig builds (worldSeed 7) ===');
console.log('roster:', JSON.stringify(cameraRoster(7)));
console.log(`sites: ${sites.length}   SITE_HALF_ANGLE ${SITE_HALF_ANGLE} rad = ${(SITE_HALF_ANGLE*DEG).toFixed(1)} deg`);
const vHalf = Math.atan(Math.tan(FOV.STATIC/2/DEG)) * DEG;         // vertical half-fov of the rendered lens
const hHalf = Math.atan(Math.tan(FOV.STATIC/2/DEG) * 16/9) * DEG;  // horizontal half-fov at 16:9
console.log(`FOV.STATIC ${FOV.STATIC} deg vertical  ->  half-angles: vertical ${vHalf.toFixed(1)}deg, horizontal ${hHalf.toFixed(1)}deg`);
console.log(`(director-rig calls SITE_HALF_ANGLE "matches FOV.STATIC at a 16:9 frame" — compare above)\n`);

console.log('=== per site: where it is, where it points, and what it therefore frames ===');
console.log('room        cam#  eyeY   aim-pitch  aim ray lands at        subj-at-centre angle-below-axis   in vert fov?');
for (const s of sites) {
  const b = s.bounds;
  const cx = (b.x0+b.x1)/2, cz = (b.z0+b.z1)/2;
  const pitch = Math.asin(-s.fwd.y) * DEG;
  // where the aim ray meets a wall or the floor
  let hit = null;
  for (let t = 0.1; t < 60; t += 0.05) {
    const x = s.x + s.fwd.x*t, y = s.y + s.fwd.y*t, z = s.z + s.fwd.z*t;
    if (y <= 0) { hit = { what:'FLOOR', x, y, z, t }; break; }
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) { hit = { what:'wall/exit', x, y:+y.toFixed(2), z, t }; break; }
  }
  const pt = { x: cx, y: 1.0, z: cz };
  const d = { x: pt.x-s.x, y: pt.y-s.y, z: pt.z-s.z };
  const dl = Math.hypot(d.x,d.y,d.z);
  const dot = (d.x*s.fwd.x + d.y*s.fwd.y + d.z*s.fwd.z)/dl;
  const off = Math.acos(Math.max(-1,Math.min(1,dot)))*DEG;
  console.log(` ${String(s.room).padEnd(10)} ${String(s.index).padStart(3)} ${s.y.toFixed(2).padStart(6)} ${pitch.toFixed(1).padStart(9)}deg  ${hit ? `${hit.what} y=${hit.y} @${hit.t.toFixed(1)}m`.padEnd(22) : 'none'.padEnd(22)}  ${off.toFixed(1).padStart(6)}deg (d=${dl.toFixed(1)}m)          ${off <= vHalf ? 'yes' : 'NO'}`);
}

console.log('\n=== coverage: of the floor of its own room, what fraction does a site (a) pass sees(), (b) also sit inside the rendered vertical fov, (c) also clear STING_MIN_RANGE ===');
console.log('room        sees()   in-frame(vert)  sting-legal   B5 eyeY<=3.2?');
for (const s of sites) {
  const b = s.bounds;
  let n=0, seen=0, framed=0, sting=0;
  for (let i=0;i<40;i++) for (let j=0;j<40;j++) {
    const x = b.x0 + (b.x1-b.x0)*(i+0.5)/40, z = b.z0 + (b.z1-b.z0)*(j+0.5)/40;
    const pt = { x, y: 1.0, z }; n++;
    if (!rig.probe.sees(s, pt)) continue;
    seen++;
    const d = { x: pt.x-s.x, y: pt.y-s.y, z: pt.z-s.z }, dl = Math.hypot(d.x,d.y,d.z);
    const off = Math.acos(Math.max(-1,Math.min(1,(d.x*s.fwd.x+d.y*s.fwd.y+d.z*s.fwd.z)/dl)))*DEG;
    // vertical component of the offset (the axis the lens is tightest on)
    const vert = Math.abs(Math.asin(d.y/dl)*DEG - Math.asin(s.fwd.y)*DEG);
    if (vert <= vHalf && off <= hHalf) framed++;
    if (dl >= STING_MIN_RANGE) sting++;
  }
  console.log(` ${String(s.room).padEnd(10)} ${(100*seen/n).toFixed(1).padStart(6)}%  ${(100*framed/n).toFixed(1).padStart(12)}%  ${(100*sting/n).toFixed(1).padStart(10)}%   ${s.y <= 3.2 ? 'yes' : 'NO  (' + s.y.toFixed(2) + 'm)'}`);
}
