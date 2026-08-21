/**
 * _solo1_boot — a faithful headless replay of `views/game.js`'s SIMULATION half.
 * Same construction order as the view: WallField -> room -> LimbField -> WeaponSystem ->
 * Player -> NoiseBus -> HunterAI -> world gadgets -> sledge -> RunState -> exits ->
 * applyExitPlan(). Everything the renderer/HUD/overlay does is dropped; nothing that moves a
 * body, damages a wall, or decides the run is dropped.
 */
const SRC = new URL('../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
/** A 2D canvas stub broad enough for `gadgets/gadgetmat.js` and the material bakers. */
const ctx2d = () => new Proxy({
  canvas: null, fillStyle: '', strokeStyle: '', globalAlpha: 1, globalCompositeOperation: '',
  lineWidth: 1, font: '', textAlign: '', textBaseline: '', filter: '', shadowBlur: 0, shadowColor: '',
  createRadialGradient: () => ({ addColorStop() {} }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createPattern: () => null,
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }),
  measureText: () => ({ width: 10 }),
}, { get(t, k) { if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } });
globalThis.document = {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; }, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: (tag) => {
    if (tag === 'canvas') { const c = { width: 64, height: 64, style: {}, getContext: () => ctx2d(), toDataURL: () => '' }; return c; }
    return { style: {}, getContext: () => null };
  },
};
const realWarn = console.warn, realErr = console.error;
const warnings = [];
console.warn = (...a) => warnings.push(a.join(' ')); console.error = (...a) => warnings.push('ERR ' + a.join(' '));
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {},
  readRenderTargetPixels: (a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });

export const THREE = await import('three');
const RM  = await import(s_('game/room.js'));
export const SP   = await import(s_('game/spaces.js'));
export const CN   = await import(s_('game/connectors.js'));
export const RULES= await import(s_('game/rules.js'));
export const RUN  = await import(s_('game/run.js'));
const { Player } = await import(s_('game/player.js'));
const { LimbField, LimbItem } = await import(s_('game/limbs.js'));
const { WeaponSystem } = await import(s_('game/weapons.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const { WallField, FINAL_STAGE } = await import(s_('destruction/wall.js'));
const { buildSledgeProp } = await import(s_('game/sledge.js'));
const DIGM = await import(s_('game/dig.js'));
export { FINAL_STAGE, LimbItem };
console.warn = realWarn; console.error = realErr;
export const bootWarnings = warnings;

/**
 * One solo world. `dig` mirrors `?dig=`; `exits` mirrors `?exits=N`; `seed` is `?seed=`.
 */
export async function makeWorld({ seed = 'rrr-test-1', dig = 'free', exitsN = 0, rngSeed = 5 } = {}) {
  let s = rngSeed >>> 0; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const scene = new THREE.Scene();
  const wallField = new WallField({ authority: true });

  const keptExits = exitsN > 0 ? new Set(SP.EXIT_SITES.slice(0, exitsN).map((x) => x.id)) : null;
  const panels = keptExits ? SP.PANELS.filter((p) => !CN.isExitSite(p) || keptExits.has(p.id)) : SP.PANELS;
  const SITES = keptExits ? SP.EXIT_SITES.filter((x) => keptExits.has(x.id)) : SP.EXIT_SITES;

  const w = console.warn, e = console.error; console.warn=()=>{};console.error=()=>{};
  const room = await RM.buildTestRoom({ work: (p) => p, quality: { dust: 1, particles: 1 }, rng },
    { wallField, panels, dig });
  console.warn = w; console.error = e;
  scene.add(room.root);

  const limbField = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  limbField.onDrop((it) => room.trackLoose(it.root, () => it.inWorld));
  limbField.onTake((it) => room.untrackLoose(it.root));
  const weapons = new WeaponSystem({ scene: null, room, limbField, debris: null, dust: null, rng });
  const player = new Player({ scene, world: room, field: limbField, rng, id: 'p1', avatar: null });
  player.pos.copy(room.spawn.player[0]);
  player.facing = Math.PI; player.aimYaw = Math.PI;

  const playerBody = { root: player.root, rig: player.rig, height: player.height,
    radius: player.radius, get noise() { return player.noise; } };
  weapons.addBody(playerBody);
  const noise = new NoiseBus();
  const hunter = new HunterAI({ room, scene, rng, weapons, position: room.spawn.hunter.clone(),
    noise, bangPolicy: 'auto' });
  hunter.absorbed = 2;                       // views/game.js:537, verbatim
  hunter.setTargets([playerBody]);
  weapons.addBody(hunter.body);
  weapons.hunter = hunter;

  // ---- world pickups, exactly the view's table
  const gadgetAnchors = [['ball','gallery.east'],['oil','service.mid'],['grapple','chapel.centre'],
    ['skates','ballroom.south'],['nailgun','gallery.west']];
  for (const [g, a] of gadgetAnchors) {
    const at = room.anchor(a); if (!at) continue;
    limbField.spawnGadget(g, new THREE.Vector3(at.x, room.floorY + 0.35, at.z),
      { height: player.height, materials: player.unit.materials });
  }
  const sledgeAt = room.anchor('study_w.north') ?? room.spawn.player[0];
  {
    const built = buildSledgeProp(player.height, { materials: player.unit.materials });
    built.root.rotation.x = Math.PI;
    const holder = new THREE.Group(); holder.name = 'pickup.sledgehammer'; holder.add(built.root);
    holder.position.set(sledgeAt.x, room.floorY + 0.35, sledgeAt.z);
    const item = new LimbItem({ id: 'world.sledge', type: 'sledge', socketKind: 'sledge',
      gadget: null, root: holder, owner: null, height: player.height });
    item.ownedBuild = built; scene.add(holder);
    limbField.drop(item, { impulse: new THREE.Vector3(0, 0.2, 0), spin: new THREE.Vector3(0, 0.4, 0) });
  }

  // ---- THE RUN
  const run = new RUN.RunState({ seed, authority: true, sites: SITES.map((x) => x.id) });
  run.addPlayer('p1');
  const exits = SITES.map((site) => {
    const panel = room.panels.find((p) => p.id === site.id);
    if (!panel) return null;
    const home = room.spaces.find((x) => x.id === site.a);
    const inside = home ? panel.sideOf(new THREE.Vector3(home.cx, 0, home.cz)) : 1;
    return { site, panel, outSign: -inside, halfW: (site.w ?? panel.width) / 2 };
  }).filter(Boolean);
  let conn = new Map();
  function applyExitPlan() {
    const plan = { exitId: run.exitId, lock: run.lock };
    conn = new Map(SP.CONNECTORS.map((c) => [c.id, CN.resolveConnector(c, plan)]));
    for (const e2 of exits) {
      const r = conn.get(e2.site.id); const st = e2.panel.state;
      st.defs = r.defs; st.stage = r.startStage; st.stageHealth = st.defs[st.stage].health;
      e2.panel._recomputeBox(); e2.panel._apply();
    }
    room.setDigPlan?.({ link: DIGM.interconnectIds(run.seed), seed: run.seed });
  }
  applyExitPlan();

  const _exv = new THREE.Vector3();
  function outThrough(e2, pos) {
    if (e2.panel.blocksMovement()) return false;
    if (room.spaceAt(pos, 0)) return false;
    if (e2.panel.sideOf(pos) !== e2.outSign) return false;
    const n = e2.panel.normal;
    _exv.set(pos.x - e2.panel.root.position.x, 0, pos.z - e2.panel.root.position.z);
    const along = Math.abs(_exv.x * n.x + _exv.z * n.z);
    const lateral = Math.abs(_exv.x * n.z - _exv.z * n.x);
    return along >= 0.45 && lateral <= e2.halfW + 1.0;
  }

  return { scene, rng, room, wallField, limbField, weapons, player, playerBody, noise, hunter,
    run, exits, conn: () => conn, applyExitPlan, outThrough, SITES, sledgeAt };
}
