import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto('http://127.0.0.1:5178/', { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { unit4hMaterials } = await import('/src/materials/surfaces/robot.js');
  const { attachIdentity } = await import('/src/characters/mesh-identity.js');
  const H = 1.7;
  const gltf = await new GLTFLoader().loadAsync('/models/anim/Meshy_AI_Lumi_Bot_biped_Animation_Walking_withSkin.glb');
  const rig = gltf.scene;
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  rig.scale.setScalar(H / (b0.max.y - b0.min.y));
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(0, -b1.min.y, 0);
  rig.updateWorldMatrix(true, true);
  const kit = attachIdentity(rig, unit4hMaterials({}), H);
  rig.updateWorldMatrix(true, true);
  const out = {};
  for (const n of ['faceplate', 'visorBezel', 'earL', 'earR']) {
    let o = null; rig.traverse(c => { if (c.name === n) o = c; });
    if (!o) { out[n] = 'MISSING'; continue; }
    o.geometry.boundingBox = null; o.geometry.boundingSphere = null;
    o.geometry.computeBoundingBox();
    const b = new THREE.Box3().setFromObject(o);
    out[n] = { min: b.min.toArray().map(v=>+v.toFixed(4)), max: b.max.toArray().map(v=>+v.toFixed(4)),
      frustumCulled: o.frustumCulled, parent: o.parent?.name ?? '?',
      visible: o.visible, mat: o.material?.name ?? '?', side: o.material?.side, tris: o.geometry.index ? o.geometry.index.count/3 : o.geometry.attributes.position.count/3 };
  }
  return { added: kit.added, out };
});
await browser.close();
console.log(JSON.stringify(r, null, 1));
