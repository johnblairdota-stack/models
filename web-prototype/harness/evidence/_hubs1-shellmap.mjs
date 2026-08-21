/*
 * builder-hubs: WHAT IS ACTUALLY IN THE SHELL ALBEDO, AND WHERE.
 *
 * WHY THIS EXISTS. The white shoulder fixtures photograph DARK at all four azimuths. Dark at
 * every angle rules out lighting and rules out form, which is what the first two builds of this
 * part each got wrong in turn. `_hubs1-fixmat.mjs` then found the structural asymmetry:
 *
 *     body mesh          uv range  u 0.319 .. 0.680   v 0.082 .. 0.925
 *     every kit fixture  uv range  u 0.000 .. 1.000   v 0.000 .. 1.000
 *
 * A LatheGeometry (and the CylinderGeometry before it) wraps u = theta/2pi over the WHOLE
 * texture, so a fixture samples two thirds of a map the body never touches. If the bake put
 * anything dark out there, every small round part made of `shellWhite` is painted with it — and
 * no change to the SHAPE can fix that, which is why this is measured before the shape is
 * touched again.
 *
 * The map is a baked render-target texture, so it has no HTMLImage to draw and `drawImage`
 * throws. It is read back through a framebuffer on the live GL context instead — the delivered
 * texels, not the authored uniform.
 *
 * usage: node harness/evidence/_hubs1-shellmap.mjs [port]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged&anim=Alert&azim=0`,
  { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 180000 });
await page.waitForTimeout(2500);

const r = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const renderer = e.renderer;
  const gl = renderer.getContext();

  let fixture = null, body = null;
  e.scene.traverse((o) => {
    if (o.isSkinnedMesh && !body) body = o;
    if (o.name === 'capFixtureFL') fixture = o;
  });
  if (!fixture) return { err: 'capFixtureFL not in scene' };

  const grab = (map) => {
    const W = map.image.width, H = map.image.height;
    const t = renderer.properties.get(map).__webglTexture;
    if (!t) return { err: 'texture not uploaded' };
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!ok) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return { err: 'fb incomplete' }; }
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    return { W, H, buf };
  };

  const stat = (g, u0, u1, v0, v1) => {
    let R = 0, G = 0, B = 0, n = 0;
    const x0 = Math.floor(u0 * g.W), x1 = Math.ceil(u1 * g.W);
    const y0 = Math.floor(v0 * g.H), y1 = Math.ceil(v1 * g.H);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * g.W + x) * 4;
      R += g.buf[i]; G += g.buf[i + 1]; B += g.buf[i + 2]; n++;
    }
    return { mean: [R / n, G / n, B / n].map(v => +v.toFixed(1)), luma: +((0.2126 * R + 0.7152 * G + 0.0722 * B) / n).toFixed(1) };
  };

  const out = {};
  const g = grab(fixture.material.map);
  if (g.err) return { err: g.err };
  out.mapSize = [g.W, g.H];
  out.sameMapAsBody = fixture.material.map === body.material.map;
  out.sameMatAsBody = fixture.material === body.material;

  /*
   * The scalar multipliers and the ORM map. Three.js MULTIPLIES material.metalness by the blue
   * channel of metalnessMap and material.roughness by the green of roughnessMap, so neither the
   * scalar nor the map alone is the delivered value — this reports both, for the fixture's
   * material AND the body's, because probe 1 already found they are not the same instance.
   */
  const scalars = (m) => ({
    metalness: m.metalness, roughness: m.roughness,
    color: [m.color.r, m.color.g, m.color.b].map(v => +v.toFixed(3)),
    envMapIntensity: m.envMapIntensity,
    clearcoat: m.clearcoat, aoMapIntensity: m.aoMapIntensity,
    maps: Object.keys(m).filter(k => /Map$/.test(k) && m[k]),
  });
  out.fixtureMat = scalars(fixture.material);
  out.bodyMat = scalars(body.material);
  for (const [who, mat] of [['fixture', fixture.material], ['body', body.material]]) {
    const mm = mat.metalnessMap || mat.roughnessMap || mat.aoMap;
    if (!mm) { out[`${who}ORM`] = 'none'; continue; }
    const og = grab(mm);
    if (og.err) { out[`${who}ORM`] = og.err; continue; }
    // R = ao, G = roughness, B = metalness in this packing
    const s = stat(og, 0, 1, 0, 1);
    const sb = stat(og, 0.319, 0.680, 0.082, 0.925);
    out[`${who}ORM`] = { size: [og.W, og.H], whole_aoRoughMetal: s.mean, bodyWindow: sb.mean };
  }
  out.wholeTexture = stat(g, 0, 1, 0, 1);
  out.bodyWindow = stat(g, 0.319, 0.680, 0.082, 0.925);
  out.outsideLeft = stat(g, 0.0, 0.319, 0, 1);
  out.outsideRight = stat(g, 0.680, 1.0, 0, 1);
  // luma per 1/16 column, to see the shape of it rather than one average
  out.columns = [];
  for (let i = 0; i < 16; i++) out.columns.push(stat(g, i / 16, (i + 1) / 16, 0, 1).luma);
  // candidate landing zones for a remapped fixture, inside the body's own window
  out.centrePatch = stat(g, 0.47, 0.53, 0.47, 0.53);
  out.bestPatch = (() => {
    let best = null;
    for (let u = 0.32; u < 0.64; u += 0.04) for (let v = 0.10; v < 0.88; v += 0.04) {
      const s = stat(g, u, u + 0.04, v, v + 0.04);
      if (!best || s.luma > best.luma) best = { u: +u.toFixed(2), v: +v.toFixed(2), ...s };
    }
    return best;
  })();
  return out;
});

await browser.close();
console.log(JSON.stringify(r, null, 1));
