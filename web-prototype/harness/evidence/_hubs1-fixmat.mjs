/*
 * builder-hubs: PROBE THE DELIVERED VALUE ON THE SHOULDER FIXTURE.
 *
 * The white shoulder bosses photograph DARK at all four azimuths. Dark at every angle is not a
 * lighting failure and not a form failure, so before changing the shape again this asks the live
 * scene what the part is actually made of: which material instance it got, what that material's
 * base colour is, and — the real suspect — what range of the albedo map its UVs sample, since a
 * lathe spans the full 0..1 of a texture that the body only ever samples in white islands.
 *
 * Reads back real texels from the albedo map through a canvas, so the number is the DELIVERED
 * colour and not the authored one.
 *
 * usage: node harness/evidence/_hubs1-fixmat.mjs [port]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const Q = 'solo=1&clip=merged&anim=Alert&label=0&azim=0';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&${Q}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 180000 });
await page.waitForTimeout(3000);

const r = await page.evaluate(async () => {
  const e = window.__rrr?.engine;
  if (!e) return { err: String(window.__rrrError).split('\n')[0] };

  const want = ['capFixtureFL', 'elbowActOL', 'earL', 'earDiscL'];
  const found = {};
  let body = null;
  e.scene.traverse((o) => {
    if (o.isSkinnedMesh && !body) body = o;
    if (want.includes(o.name)) found[o.name] = o;
  });

  // Read an image/canvas-backed texture back into a canvas so we can sample real texels.
  const sample = (tex, u0, v0, u1, v1) => {
    if (!tex || !tex.image) return null;
    const img = tex.image;
    const W = img.width, H = img.height;
    if (!W || !H) return null;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    try { g.drawImage(img, 0, 0); } catch (err) { return { err: String(err) }; }
    const x0 = Math.max(0, Math.floor(u0 * W)), x1 = Math.min(W, Math.ceil(u1 * W));
    const y0 = Math.max(0, Math.floor((1 - v1) * H)), y1 = Math.min(H, Math.ceil((1 - v0) * H));
    let d;
    try { d = g.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data; }
    catch (err) { return { err: String(err) }; }
    let R = 0, G = 0, B = 0, n = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      R += d[i]; G += d[i + 1]; B += d[i + 2]; n++;
      if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 110) dark++;
    }
    return { size: [W, H], mean: [R / n, G / n, B / n].map(v => +v.toFixed(1)),
      darkFrac: +(dark / n).toFixed(3), px: n };
  };

  const uvRange = (geo) => {
    const uv = geo.attributes.uv;
    if (!uv) return null;
    let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    return [u0, u1, v0, v1].map(v => +v.toFixed(3));
  };

  const describe = (o) => {
    if (!o) return null;
    const m = o.material;
    const uvr = uvRange(o.geometry);
    return {
      matUuid: m.uuid.slice(0, 8),
      color: m.color ? [m.color.r, m.color.g, m.color.b].map(v => +v.toFixed(3)) : null,
      metalness: m.metalness, roughness: m.roughness,
      hasMap: !!m.map,
      mapRepeat: m.map ? [m.map.repeat.x, m.map.repeat.y] : null,
      uvRange: uvr,
      // what the part's own UV window actually contains
      mapInWindow: uvr ? sample(m.map, uvr[0], uvr[2], uvr[1], uvr[3]) : null,
    };
  };

  const out = { present: Object.keys(found) };
  for (const k of want) out[k] = describe(found[k]);
  out.body = body ? { matUuid: body.material.uuid.slice(0, 8),
    uvRange: uvRange(body.geometry),
    whole: sample(body.material.map, 0, 0, 1, 1) } : null;
  out.sameMatAsBody = found.capFixtureFL && body
    ? found.capFixtureFL.material.uuid === body.material.uuid : null;
  return out;
});

await browser.close();
console.log(JSON.stringify(r, null, 2));
