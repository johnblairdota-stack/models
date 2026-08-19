// estate-owner-11 scratch: dump each end plate's planar-reflection RENDER TARGET to a PNG at
// its native resolution, plus a version box-filtered down to the plate's real SCREEN size.
//
// Why both: the plate is 71 x 142 screen px and its target is 506 x 1024, so the shader is
// MINIFYING about 7:1 with a single bilinear tap. The native dump says what the reflection
// CONTAINS; the box-filtered dump says what a correctly filtered 71-px plate could show. The
// difference between the filtered version and the pixels actually on screen is the sampling
// loss, and that is a number rather than an adjective.
//
// ⚠ The RT is HalfFloat, so it is NOT read with readRenderTargetPixels here (wrong array type
// returns zeros silently — see HANDOFF). It is drawn through a MeshBasicMaterial into an
// 8-bit sRGB target and read back from that, which is the same path the eye gets.
//
// Usage: node harness/_tmp_eo11_rt.mjs <outDir> ["&extra=..."]
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const DIR = process.argv[2] ?? 'C:/Users/John/AppData/Local/Temp/claude';
const EXTRA = process.argv[3] ?? '';

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1${EXTRA}`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
await page.evaluate((n) => window.__rrr.settle(n), 12);

const dumps = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const out = [];
  for (const m of e.endPlates) {
    const rt = m.userData.mirrorRT;
    if (!rt) continue;
    out.push({ name: m.name, w: rt.width, h: rt.height });
  }
  return out;
});
console.log('plates:', JSON.stringify(dumps));

// The page has no THREE global, so the copy pass is written in raw WebGL against the RT's own
// texture handle via renderer.properties — simpler and with fewer constructors to find.
for (const d of dumps) {
  const dataUrl = await page.evaluate(({ name }) => {
    const e = window.__rrr.engine, r = e.renderer;
    const m = e.endPlates.find((x) => x.name === name);
    const rt = m.userData.mirrorRT;
    const gl = r.getContext();
    const props = r.properties.get(rt.texture);
    const tex = props.__webglTexture;
    if (!tex) return null;

    // minimal fullscreen-quad program: sample the HDR target, write sRGB-encoded 8-bit.
    const VS =['#version 300 es', 'in vec2 p; out vec2 v;',
      'void main(){ v = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }'].join('\n');
    const FS = ['#version 300 es', 'precision highp float;', 'in vec2 v; out vec4 o;',
      'uniform sampler2D t;',
      'vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,1e-5),vec3(1.0/2.4))-0.055, step(0.0031308,c)); }',
      'void main(){ vec3 c = texture(t, v).rgb; o = vec4(srgb(clamp(c,0.0,1.0)), 1.0); }'].join('\n');
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

    const W = rt.width, H = rt.height;
    const fbo = gl.createFramebuffer();
    const col = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, col);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, col, 0);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, 't'), 0);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // control: a fully zero buffer means nothing was read, not a black reflection.
    let nz = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] || px[i + 1] || px[i + 2]) nz++;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo); gl.deleteTexture(col); gl.deleteBuffer(vbo); gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
    r.resetState();

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    const id = cx.createImageData(W, H);
    // gl reads bottom-up
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4, dst = y * W * 4;
      id.data.set(px.subarray(src, src + W * 4), dst);
    }
    cx.putImageData(id, 0, 0);
    return { url: cv.toDataURL('image/png'), nonZero: nz, total: W * H };
  }, { name: d.name });

  if (!dataUrl) { console.log(d.name, 'NO TEXTURE'); continue; }
  const file = `${DIR}/eo11-rt-${d.name.replace(/[^a-z0-9]/gi, '_')}.png`;
  writeFileSync(file, Buffer.from(dataUrl.url.split(',')[1], 'base64'));
  console.log(`${d.name} ${d.w}x${d.h} -> ${file}  nonZero ${(100 * dataUrl.nonZero / dataUrl.total).toFixed(1)}%`);
}

await browser.close();
