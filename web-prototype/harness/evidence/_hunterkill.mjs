#!/usr/bin/env node
/**
 * 🔪 **_hunterkill — CAN THE HUNTER ACTUALLY TAKE THE RUNNER IN `party.expedition`?**
 *
 * `views/expedition.js:362` is the mode's ONLY death test:  `if (contact < 1.35) finish('taken')`
 * where `contact` is the XZ distance between the runner and `hunter.root.position`.
 * `hunter-ai.js:692` stops the Hunter at `seenD < reach * (stage * 0.35 + 0.8)` and `_attack`
 * then damps `vel` by `exp(-10 dt)` — it stands still and swings. So the question is whether the
 * Hunter's own approach ever puts it inside 1.35 m of a body.
 *
 * Staged the way `flee-survival.mjs` stages: a fixed separation, PURSUE, and a runner that does
 * the WORST thing (stands still). If 1.35 m is unreachable from there it is unreachable.
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
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { HUNTER_SENSE, MOVE } = await import(s_('game/rules.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn;

const DT = 1 / 60;
const SITES = ['gallery.mid', 'gallery.east', 'ballroom.centre', 'study_e.north', 'service.mid'].filter((n) => room.anchor(n));
const centre = room.anchor(process.env.SITE || SITES[0]);
console.log('site', process.env.SITE || SITES[0], '->', centre.toArray().map((v)=>+v.toFixed(2)).join(','), ' | anchors available:', SITES.join(' '));

for (const stage of [1, 2, 3]) {
  for (const mode of ['still', 'walk-away', 'walk-into']) {
    let seed = 99; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    // a body with four limbs that really come off
    let sockets = { shoulderL: 'armL', shoulderR: 'armR', hipL: 'legL', hipR: 'legR' };
    const root = new THREE.Object3D();
    root.position.set(centre.x, 0, centre.z);
    const runner = { root, height: 1.7, radius: 0.34, noise: 0,
      rig: { caps: { downed: false }, occupant: (s) => sockets[s] ?? 'empty', detach: (s) => { delete sockets[s]; return null; } } };

    const h = new HunterAI({ room, scene: null, rng, position: new THREE.Vector3(centre.x + 6, 0, centre.z), bangPolicy: 'off', stage });
    h.radius = 0.30 + stage * 0.12;
    h.setTargets([runner]);
    h.awareness = 1; h.state = 'PURSUE'; h.target = runner; h.lastKnown.copy(root.position);
    let takenLimbs = 0; h.onKill = () => takenLimbs++;

    let minContact = Infinity, firstAttack = null, taken = null;
    for (let i = 0; i < 60 * 30; i++) {
      const t = i * DT;
      if (mode === 'walk-away') { const d = new THREE.Vector3().subVectors(root.position, h.root.position).setY(0).normalize(); root.position.addScaledVector(d, MOVE.run * DT); runner.noise = 1; }
      if (mode === 'walk-into') { const d = new THREE.Vector3().subVectors(h.root.position, root.position).setY(0).normalize(); root.position.addScaledVector(d, MOVE.walk * DT); runner.noise = 0.49; }
      root.position.copy(room.collide(root.position, runner.radius, 1.70, 0.55));
      h.update(DT, t);
      const c = Math.hypot(root.position.x - h.root.position.x, root.position.z - h.root.position.z);
      if (c < minContact) minContact = c;
      if (firstAttack == null && h.state === 'ATTACK') firstAttack = { t: +t.toFixed(2), c: +c.toFixed(2) };
      if (taken == null && c < 1.35) taken = +t.toFixed(2);
    }
    const gate = HUNTER_SENSE.reach * (stage * 0.35 + 0.8);
    // ⚠️ `ATTACK_WINDUP` is 0.85 s (`hunter-ai.js:82`) and is the whole of the player's reaction
    // window. If the party mode's proximity kill lands INSIDE it, the windup never completes and
    // the anticipation pose the file exists for is decoration.
    const win = (firstAttack && taken != null) ? +(taken - firstAttack.t).toFixed(2) : null;
    console.log(`stage ${stage} · runner ${mode.padEnd(10)} · ATTACK gate ${gate.toFixed(2)} m · first ATTACK ${firstAttack ? `t=${firstAttack.t}s at ${firstAttack.c} m` : 'never'} · min contact ${minContact.toFixed(2)} m · limbs ${takenLimbs} · "taken" at ${taken ?? 'NEVER'}${win != null ? ` · ATTACK->taken ${win}s vs ATTACK_WINDUP 0.85s ${win < 0.85 ? '<< WINDUP NEVER COMPLETED' : ''}` : ''}`);
  }
}
